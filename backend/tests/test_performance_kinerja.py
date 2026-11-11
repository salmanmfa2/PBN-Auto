import csv
import unittest
from io import BytesIO, StringIO
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.auth import get_current_user
from app.history_db import Base, get_history_db
from app.models.performance_kinerja import (
    PerformanceKinerjaDataset,
    PerformanceKinerjaInsight,
    PerformanceKinerjaRecord,
)
from app.services import performance_kinerja_service as service
from main import app


NIP = "123456789012345678"
EMPLOYEE = {
    NIP: {
        "nama": "Pegawai Contoh",
        "unit_eselon_ii": "Direktorat Contoh",
        "unit_eselon_iii": "Subdirektorat Contoh",
        "eselon": "III",
    }
}


def full_csv(
    *,
    nip: str = NIP,
    nhk: str = "80",
    npk: str = "100",
    nkp_awal: str = "85",
    nko: str = "90",
    hukdis: str = "-1",
    dampak_pelanggaran: str = "-2",
    dampak_perilaku: str = "-3",
    koreksi: str = "1",
    nkp_akhir: str = "83.5",
) -> bytes:
    row = [
        "Pegawai Contoh",
        nip,
        nhk,
        npk,
        "80",
        "100",
        nkp_awal,
        "Di atas Ekspektasi",
        "Sesuai Ekspektasi",
        "Baik",
        hukdis,
        dampak_pelanggaran,
        dampak_perilaku,
        koreksi,
        nko,
        nkp_akhir,
        "Di atas Ekspektasi",
        "Sesuai Ekspektasi",
        "Baik",
    ]
    output = StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(service.FULL_DATA_HEADERS)
    writer.writerow(row)
    return output.getvalue().encode("utf-8")


def adjustment_xlsx(rows: list[list[object]]) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.append(service.ADJUSTMENT_HEADERS)
    for row in rows:
        worksheet.append(row)
    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    return stream.getvalue()


class PerformanceKinerjaServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[
                PerformanceKinerjaDataset.__table__,
                PerformanceKinerjaRecord.__table__,
            ],
        )
        self.session = Session(self.engine)
        self.employee_lookup = patch.object(
            service,
            "_lookup_employee_records",
            return_value=EMPLOYEE,
        )
        self.employee_lookup.start()
        self.addCleanup(self.employee_lookup.stop)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.session.close)

    def import_active_dataset(self) -> None:
        service.replace_full_upload(
            self.session,
            full_csv(),
            "Q3-2026",
            uploaded_by_user="admin",
            uploaded_by_name="Admin",
        )

    def test_full_import_normalizes_nip_and_preserves_source_scores(self) -> None:
        content = full_csv(
            nip=f"\t {NIP}",
            nhk="80,0",
            npk="100,0",
            nkp_awal="84",
            nkp_akhir="119",
        )
        with patch.object(service, "_lookup_employee_records", return_value=EMPLOYEE):
            result = service.validate_full_upload(content, "q3-2026")

        self.assertEqual(
            result,
            {
                "period": "Q3-2026",
                "row_count": 1,
                "unidentified_count": 0,
                "normalized_penalty_count": 0,
            },
        )
        service.replace_full_upload(
            self.session,
            content,
            "Q3-2026",
            uploaded_by_user="admin",
            uploaded_by_name="Admin",
        )
        record = self.session.get(PerformanceKinerjaRecord, NIP)
        self.assertEqual(record.nkp_awal, 84)
        self.assertEqual(record.nkp_akhir, 119)
        self.assertEqual(record.unit_eselon_iii, "Subdirektorat Contoh")
        self.assertEqual(record.nko, 90)
        self.assertEqual(record.rating_hasil_kerja, "Di atas Ekspektasi")

    def test_status_uses_contiguous_score_bands_and_missing_state(self) -> None:
        cases = {
            "115": "Sangat Istimewa",
            "114.99": "Istimewa",
            "110": "Istimewa",
            "109.99": "Tinggi",
            "100": "Tinggi",
            "99.99": "Sedang",
            "90": "Sedang",
            "89.99": "Rendah",
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(service.get_status(service.Decimal(value)), expected)
        self.assertEqual(service.get_status(None), "Tidak tersedia")

    def test_full_import_rejects_duplicate_nips_without_replacing_data(self) -> None:
        self.import_active_dataset()
        existing = self.session.get(PerformanceKinerjaRecord, NIP)
        self.assertEqual(existing.nama, "Pegawai Contoh")

        duplicate_csv = full_csv() + full_csv().split(b"\n", 1)[1]
        with patch.object(service, "_lookup_employee_records", return_value=EMPLOYEE):
            with self.assertRaisesRegex(ValueError, "Duplicate NIPs"):
                service.replace_full_upload(
                    self.session,
                    duplicate_csv,
                    "Q4-2026",
                    uploaded_by_user="admin",
                    uploaded_by_name="Admin",
                )
        self.assertEqual(self.session.get(PerformanceKinerjaDataset, 1).period, "Q3-2026")

        with patch.object(service, "_lookup_employee_records", return_value={}):
            result = service.replace_full_upload(
                self.session,
                full_csv(nip="1234567890123456", hukdis="26"),
                "Q4-2026",
                uploaded_by_user="admin",
                uploaded_by_name="Admin",
            )
        self.assertEqual(result["unidentified_count"], 1)
        unmatched = self.session.get(PerformanceKinerjaRecord, "1234567890123456")
        self.assertEqual(unmatched.unit_eselon_ii, "Unidentified")
        self.assertEqual(unmatched.eselon, "Unidentified")
        self.assertEqual(unmatched.nilai_hukuman_disiplin, -26)
        self.assertEqual(self.session.get(PerformanceKinerjaDataset, 1).period, "Q4-2026")

    def test_positive_penalty_magnitudes_are_normalized_and_reported(self) -> None:
        content = full_csv(
            nip="1234567890123456",
            hukdis="26",
            dampak_pelanggaran="2",
            dampak_perilaku="1",
        )
        with patch.object(service, "_lookup_employee_records", return_value={}):
            result = service.validate_full_upload(content, "Q3-2026")
        self.assertEqual(result["unidentified_count"], 1)
        self.assertEqual(result["normalized_penalty_count"], 3)
        parsed = service._read_full_csv(content)[0]
        self.assertEqual(parsed["nilai_hukuman_disiplin"], -26)
        self.assertEqual(parsed["nilai_dampak_pelanggaran_disiplin"], -2)
        self.assertEqual(parsed["nilai_dampak_perilaku"], -1)

    def test_invalid_decimal_and_range_are_reported_with_nip(self) -> None:
        with self.assertRaisesRegex(ValueError, "NPK must be between 0 and 120"):
            service._read_full_csv(full_csv(npk="121"))
        with self.assertRaisesRegex(ValueError, f"NIP {NIP}.*Nilai Koreksi"):
            service._read_full_csv(full_csv(koreksi="21"))

    def test_adjustment_blanks_preserve_values_and_recalculate_final_score(self) -> None:
        self.import_active_dataset()
        service.replace_adjustments(
            self.session,
            adjustment_xlsx([[NIP, -3, None, -4, -1]]),
            "Q3-2026",
        )
        record = self.session.get(PerformanceKinerjaRecord, NIP)
        self.assertEqual(record.nko, 90)
        self.assertEqual(record.nkp_awal, 85)
        self.assertEqual(record.nilai_hukuman_disiplin, -3)
        self.assertEqual(record.nilai_dampak_pelanggaran_disiplin, -2)
        self.assertEqual(record.nilai_dampak_perilaku, -4)
        self.assertEqual(record.nilai_koreksi, -1)
        self.assertEqual(record.nkp_akhir, 79.5)

    def test_adjustment_positive_penalties_are_normalized(self) -> None:
        self.import_active_dataset()
        content = adjustment_xlsx([[NIP, 3, 5, 6, 1]])
        validation = service.validate_adjustment_upload(self.session, content, "Q3-2026")
        self.assertEqual(validation["normalized_penalty_count"], 3)
        result = service.replace_adjustments(self.session, content, "Q3-2026")
        self.assertEqual(result["normalized_penalty_count"], 3)
        record = self.session.get(PerformanceKinerjaRecord, NIP)
        self.assertEqual(record.nilai_hukuman_disiplin, -3)
        self.assertEqual(record.nilai_dampak_pelanggaran_disiplin, -5)
        self.assertEqual(record.nilai_dampak_perilaku, -6)
        self.assertEqual(record.nilai_koreksi, 1)

    def test_adjustment_unknown_duplicate_and_wrong_period_do_not_change_rows(self) -> None:
        self.import_active_dataset()
        original = self.session.get(PerformanceKinerjaRecord, NIP).nkp_akhir
        with self.assertRaisesRegex(ValueError, "Unknown NIPs"):
            service.replace_adjustments(
                self.session,
                adjustment_xlsx([["999999999999999999", -3, None, None, None]]),
                "Q3-2026",
            )
        duplicate_file = adjustment_xlsx([[NIP, -3, None, None, None], [NIP, -4, None, None, None]])
        with self.assertRaisesRegex(ValueError, "Duplicate NIPs"):
            service.replace_adjustments(self.session, duplicate_file, "Q3-2026")
        with self.assertRaisesRegex(ValueError, "active dataset is Q3-2026"):
            service.replace_adjustments(
                self.session,
                adjustment_xlsx([[NIP, -3, None, None, None]]),
                "Q4-2026",
            )
        self.assertEqual(self.session.get(PerformanceKinerjaRecord, NIP).nkp_akhir, original)

    def test_template_stores_nip_as_text(self) -> None:
        workbook = load_workbook(BytesIO(service.create_adjustment_template()))
        self.addCleanup(workbook.close)
        worksheet = workbook.active
        self.assertEqual(
            [cell.value for cell in worksheet[1]],
            list(service.ADJUSTMENT_HEADERS),
        )
        self.assertEqual(worksheet["A2"].number_format, "@")

    def test_analysis_groups_by_live_employee_data_and_counts_nonzero_penalties(self) -> None:
        self.import_active_dataset()
        with patch.object(service, "_lookup_employee_records", return_value=EMPLOYEE):
            result = service.get_analysis(self.session, "unit_eselon_ii")
        self.assertEqual(result["dataset"]["period"], "Q3-2026")
        self.assertEqual(result["groups"][0]["label"], "Direktorat Contoh")
        self.assertEqual(result["groups"][0]["employee_count"], 1)
        self.assertEqual(result["groups"][0]["hukdis_count"], 1)
        self.assertEqual(result["groups"][0]["dampak_pelanggaran_count"], 1)
        self.assertEqual(result["groups"][0]["dampak_perilaku_count"], 1)
        self.assertEqual(result["groups"][0]["correction"]["count"], 1)
        self.assertEqual(result["groups"][0]["correction"]["positive_count"], 1)
        self.assertEqual(result["groups"][0]["correction"]["negative_count"], 0)
        npk_bin = next(item for item in result["groups"][0]["histogram"] if item["start"] == 100)
        self.assertEqual(npk_bin["count"], 1)

    def test_histogram_only_includes_npk_from_80_to_120(self) -> None:
        values = ("79.99", "80", "81.99", "82", "119.99", "120", "120.01")
        records = [
            PerformanceKinerjaRecord(
                nip=f"{index:018}",
                dataset_id=1,
                nama="Pegawai",
                npk=service.Decimal(value),
            )
            for index, value in enumerate(values, start=1)
        ]
        bins = service._make_histogram(records)
        self.assertEqual(len(bins), 20)
        self.assertEqual((bins[0]["start"], bins[0]["end"], bins[0]["count"]), (80, 82, 2))
        self.assertEqual((bins[-1]["start"], bins[-1]["end"], bins[-1]["count"]), (118, 120, 2))
        self.assertEqual(sum(item["count"] for item in bins), 5)

    def test_correction_counts_nonzero_values_and_splits_additions_and_deductions(self) -> None:
        self.import_active_dataset()
        values = ("-1", "-2", "3", "0", "0", "0.23", "2", "1")
        for index, value in enumerate(values[1:], start=2):
            self.session.add(
                PerformanceKinerjaRecord(
                    nip=f"{index:018}",
                    dataset_id=1,
                    nama=f"Pegawai {index}",
                    nilai_koreksi=service.Decimal(value),
                )
            )
        self.session.get(PerformanceKinerjaRecord, NIP).nilai_koreksi = service.Decimal(values[0])
        result = service.get_analysis(self.session, "overall")
        correction = result["groups"][0]["correction"]
        self.assertEqual(correction["count"], 6)
        self.assertEqual(correction["negative_count"], 2)
        self.assertEqual(correction["positive_count"], 4)
        self.assertEqual(correction["average"], 0.4)
        self.assertEqual(correction["minimum"], -2)
        self.assertEqual(correction["maximum"], 3)

    def test_dashboard_applies_overview_filters_and_expands_unit_metrics(self) -> None:
        self.import_active_dataset()
        first = self.session.get(PerformanceKinerjaRecord, NIP)
        first.unit_eselon_ii = "Unit A"
        first.unit_eselon_iii = "Unit A - III"
        first.eselon = "III"
        first.npk = service.Decimal("100")
        first.nhk = service.Decimal("90")
        first.nkp_awal = service.Decimal("116")
        first.nkp_akhir = service.Decimal("115")
        first.nilai_koreksi = service.Decimal("0")
        self.session.add_all(
            [
                PerformanceKinerjaRecord(
                    nip="123456789012345679",
                    dataset_id=1,
                    nama="Pegawai A4",
                    unit_eselon_ii="Unit A",
                    unit_eselon_iii="Unit A - IV",
                    eselon="IV",
                    nhk=service.Decimal("70"),
                    npk=service.Decimal("80"),
                    nkp_awal=service.Decimal("114"),
                    nkp_akhir=service.Decimal("110"),
                    nilai_koreksi=service.Decimal("-2"),
                ),
                PerformanceKinerjaRecord(
                    nip="123456789012345680",
                    dataset_id=1,
                    nama="Pegawai B3",
                    unit_eselon_ii="Unit B",
                    unit_eselon_iii="Unit B - III",
                    eselon="III",
                    nhk=service.Decimal("90"),
                    npk=service.Decimal("110"),
                    nkp_awal=service.Decimal("120"),
                    nkp_akhir=service.Decimal("114"),
                    nilai_koreksi=service.Decimal("3"),
                ),
            ]
        )
        self.session.commit()
        with patch.object(service, "_lookup_employee_records", return_value={}):
            result = service.get_dashboard(self.session, "Unit A", ["IV"])

        self.assertEqual(result["overview"]["employee_count"], 1)
        self.assertEqual(result["unit_eselon_ii_options"], ["Unit A", "Unit B"])
        self.assertEqual(result["eselon_options"], ["III", "IV"])
        unit_a = next(unit for unit in result["units"] if unit["label"] == "Unit A")
        self.assertEqual(unit_a["employee_count"], 2)
        self.assertEqual(unit_a["average_npk"], 90)
        self.assertEqual(unit_a["nkp_awal_sangat_istimewa_count"], 1)
        self.assertEqual(unit_a["nkp_awal_sangat_istimewa_percentage"], 50)
        self.assertEqual(unit_a["status_gap_count"], 0)
        self.assertEqual(unit_a["correction"]["count"], 1)
        self.assertEqual(unit_a["correction"]["negative_count"], 1)
        self.assertEqual(
            {child["label"] for child in unit_a["children"]},
            {"Unit A - III", "Unit A - IV"},
        )
        unit_b = next(unit for unit in result["units"] if unit["label"] == "Unit B")
        self.assertEqual(unit_b["status_gap_count"], 1)

    def test_get_records_filters_and_sorts_across_the_dataset(self) -> None:
        self.import_active_dataset()
        first = self.session.get(PerformanceKinerjaRecord, NIP)
        first.nama = "Zelda"
        first.unit_eselon_ii = "Unit A"
        first.nhk = service.Decimal("100")
        self.session.add_all(
            [
                PerformanceKinerjaRecord(
                    nip="123456789012345679",
                    dataset_id=1,
                    nama="Alpha",
                    unit_eselon_ii="Unit A",
                    nhk=service.Decimal("110"),
                ),
                PerformanceKinerjaRecord(
                    nip="123456789012345680",
                    dataset_id=1,
                    nama="Beta",
                    unit_eselon_ii="Unit B",
                    nhk=service.Decimal("120"),
                ),
            ]
        )
        self.session.commit()
        service.invalidate_dashboard_cache()

        with patch.object(service, "_lookup_employee_records", return_value={}):
            descending = service.get_records(
                self.session,
                page=1,
                page_size=1,
                search="",
                filters={"unit_eselon_ii": "unit a"},
                sort_by="nhk",
                sort_order="desc",
            )
            ascending = service.get_records(
                self.session,
                page=1,
                page_size=2,
                search="",
                filters={"unit_eselon_ii": "Unit A"},
                sort_by="nama",
                sort_order="asc",
            )

        self.assertEqual(descending["total"], 2)
        self.assertEqual(descending["records"][0]["nip"], "123456789012345679")
        self.assertEqual(
            [record["nama"] for record in ascending["records"]],
            ["Alpha", "Zelda"],
        )

    def test_dashboard_cache_reuses_employee_lookup_and_refreshes_after_adjustments(self) -> None:
        with patch.object(service, "_lookup_employee_records", return_value=EMPLOYEE) as lookup:
            self.import_active_dataset()
            lookup.reset_mock()

            service.get_dashboard(self.session, None, [])
            service.get_dashboard(self.session, None, ["III"])
            self.assertEqual(lookup.call_count, 1)

            lookup.reset_mock()
            service.replace_adjustments(
                self.session,
                adjustment_xlsx([[NIP, -3, None, None, None]]),
                "Q3-2026",
            )
            service.get_dashboard(self.session, None, [])
            self.assertEqual(lookup.call_count, 1)

    def test_excel_exports_include_unit_children_and_search_all_matching_records(self) -> None:
        second_nip = "123456789012345679"
        content = full_csv() + full_csv(nip=second_nip).split(b"\n", 1)[1]
        employees = {
            NIP: {
                "unit_eselon_ii": "Unit A",
                "unit_eselon_iii": "Subunit A",
                "eselon": "III",
            },
            second_nip: {
                "unit_eselon_ii": "Unit A",
                "unit_eselon_iii": "Subunit A",
                "eselon": "III",
            },
        }
        with patch.object(service, "_lookup_employee_records", return_value=employees):
            service.replace_full_upload(
                self.session,
                content,
                "Q3-2026",
                uploaded_by_user="admin",
                uploaded_by_name="Admin",
            )
            unit_workbook = load_workbook(
                BytesIO(service.create_unit_analysis_workbook(self.session)),
                data_only=True,
            )
            records_workbook = load_workbook(
                BytesIO(service.create_performance_records_workbook(self.session)),
                data_only=True,
            )
            filtered_workbook = load_workbook(
                BytesIO(
                    service.create_performance_records_workbook(
                        self.session,
                        search=second_nip[-6:],
                    )
                ),
                data_only=True,
            )

        unit_sheet = unit_workbook["Unit Eselon II"]
        record_sheet = records_workbook["Daftar Pegawai"]
        filtered_sheet = filtered_workbook["Daftar Pegawai"]
        self.assertEqual(unit_sheet.max_row, 3)
        self.assertEqual(unit_sheet["U1"].value, "Gap Status")
        self.assertEqual(unit_sheet["A2"].value, "Unit A")
        self.assertEqual(unit_sheet["U2"].value, 0)
        self.assertEqual(unit_sheet["A3"].value, "Unit A")
        self.assertEqual(unit_sheet["B3"].value, "Subunit A")
        self.assertEqual(record_sheet.max_row, 3)
        self.assertEqual(record_sheet["B2"].value, NIP)
        self.assertEqual(record_sheet["B2"].number_format, "@")
        self.assertEqual(record_sheet["B3"].value, second_nip)
        self.assertEqual(filtered_sheet.max_row, 2)
        self.assertEqual(filtered_sheet["B2"].value, second_nip)
        unit_workbook.close()
        records_workbook.close()
        filtered_workbook.close()

    def test_get_records_returns_paginated_rows_and_unidentified_group(self) -> None:
        service.replace_full_upload(
            self.session,
            full_csv(nip="1234567890123456"),
            "Q3-2026",
            uploaded_by_user="admin",
            uploaded_by_name="Admin",
        )
        with patch.object(service, "_lookup_employee_records", return_value={}):
            result = service.get_records(self.session, page=1, page_size=1, search="Pegawai")
        self.assertEqual(result["total"], 1)
        self.assertEqual(len(result["records"]), 1)
        self.assertEqual(result["records"][0]["unit_eselon_ii"], "Unidentified")
        self.assertEqual(result["records"][0]["eselon"], "Unidentified")
        self.assertEqual(result["records"][0]["status"], "Rendah")


class PerformanceKinerjaAuthorizationTests(unittest.TestCase):
    def tearDown(self) -> None:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_history_db, None)

    def test_normal_admin_cannot_upload_performance_data(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="admin",
            name="Admin",
            auth_level=2,
        )
        try:
            response = TestClient(app).post(
                "/performance/full-data/validate",
                data={"period": "Q3-2026"},
                files={"file": ("data.csv", full_csv(), "text/csv")},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)
        self.assertEqual(response.status_code, 403)

    def test_guest_can_read_empty_analysis_and_records(self) -> None:
        test_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            test_engine,
            tables=[
                PerformanceKinerjaDataset.__table__,
                PerformanceKinerjaRecord.__table__,
                PerformanceKinerjaInsight.__table__,
            ],
        )
        def override_history_db():
            with Session(test_engine) as session:
                yield session

        app.dependency_overrides[get_history_db] = override_history_db
        try:
            client = TestClient(app)
            response = client.get("/performance/analysis")
            dashboard_response = client.get("/performance/dashboard")
            insight_response = client.get("/performance/insight")
            records_response = client.get("/performance/records")
            unit_export_response = client.get("/performance/exports/unit-eselon-ii")
            records_export_response = client.get("/performance/exports/records")
        finally:
            app.dependency_overrides.pop(get_history_db, None)
            test_engine.dispose()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["dataset"], None)
        self.assertEqual(response.json()["total_employees"], 0)
        self.assertEqual(dashboard_response.status_code, 200)
        self.assertEqual(dashboard_response.json()["overview"]["employee_count"], 0)
        self.assertEqual(insight_response.status_code, 200)
        self.assertEqual(insight_response.json()["content"], "")
        self.assertEqual(records_response.status_code, 200)
        self.assertEqual(records_response.json()["records"], [])
        self.assertEqual(records_response.json()["total"], 0)
        self.assertEqual(unit_export_response.status_code, 200)
        self.assertEqual(records_export_response.status_code, 200)
        self.assertIn(
            "spreadsheetml.sheet",
            unit_export_response.headers["content-type"],
        )
        self.assertIn(
            "spreadsheetml.sheet",
            records_export_response.headers["content-type"],
        )

    def test_admin_can_update_shared_insight_and_regular_user_cannot(self) -> None:
        test_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            test_engine,
            tables=[
                PerformanceKinerjaDataset.__table__,
                PerformanceKinerjaRecord.__table__,
                PerformanceKinerjaInsight.__table__,
            ],
        )

        def override_history_db():
            with Session(test_engine) as session:
                yield session

        app.dependency_overrides[get_history_db] = override_history_db
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="admin",
            name="Admin",
            auth_level=2,
        )
        try:
            client = TestClient(app)
            response = client.put("/performance/insight", json={"content": "Ringkasan bersama"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["content"], "Ringkasan bersama")
            self.assertEqual(response.json()["updated_by_name"], "Admin")

            app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
                user="user",
                name="User",
                auth_level=1,
            )
            denied = client.put("/performance/insight", json={"content": "Tidak diizinkan"})
        finally:
            app.dependency_overrides.pop(get_history_db, None)
            app.dependency_overrides.pop(get_current_user, None)
            test_engine.dispose()

        self.assertEqual(denied.status_code, 403)

    def test_guest_dashboard_endpoint_applies_repeated_eselon_filters(self) -> None:
        test_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            test_engine,
            tables=[
                PerformanceKinerjaDataset.__table__,
                PerformanceKinerjaRecord.__table__,
            ],
        )
        with Session(test_engine) as session:
            session.add(
                PerformanceKinerjaDataset(
                    id=1,
                    period="Q3-2026",
                    row_count=3,
                    uploaded_by_user="admin",
                    uploaded_by_name="Admin",
                )
            )
            session.add_all(
                [
                    PerformanceKinerjaRecord(
                        nip="123456789012345678",
                        dataset_id=1,
                        nama="Pegawai III",
                        unit_eselon_ii="Unit A",
                        unit_eselon_iii="Unit A - III",
                        eselon="III",
                    ),
                    PerformanceKinerjaRecord(
                        nip="123456789012345679",
                        dataset_id=1,
                        nama="Pegawai IV",
                        unit_eselon_ii="Unit A",
                        unit_eselon_iii="Unit A - IV",
                        eselon="IV",
                    ),
                    PerformanceKinerjaRecord(
                        nip="123456789012345680",
                        dataset_id=1,
                        nama="Pegawai V",
                        unit_eselon_ii="Unit A",
                        unit_eselon_iii="Unit A - V",
                        eselon="V",
                    ),
                ]
            )
            session.commit()

        def override_history_db():
            with Session(test_engine) as session:
                yield session

        app.dependency_overrides[get_history_db] = override_history_db
        try:
            with patch.object(service, "_lookup_employee_records", return_value={}):
                response = TestClient(app).get(
                    "/performance/dashboard",
                    params=[
                        ("unit_eselon_ii", "Unit A"),
                        ("eselon", "III"),
                        ("eselon", "IV"),
                    ],
                )
        finally:
            app.dependency_overrides.pop(get_history_db, None)
            test_engine.dispose()

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["overview"]["employee_count"], 2)
        self.assertEqual(len(payload["units"]), 1)
        self.assertEqual(len(payload["units"][0]["children"]), 3)

    def test_guest_records_endpoint_applies_column_filters_and_sorting(self) -> None:
        test_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            test_engine,
            tables=[
                PerformanceKinerjaDataset.__table__,
                PerformanceKinerjaRecord.__table__,
            ],
        )
        with Session(test_engine) as session:
            session.add(
                PerformanceKinerjaDataset(
                    id=1,
                    period="Q3-2026",
                    row_count=3,
                    uploaded_by_user="admin",
                    uploaded_by_name="Admin",
                )
            )
            session.add_all(
                [
                    PerformanceKinerjaRecord(
                        nip="123456789012345678",
                        dataset_id=1,
                        nama="Alpha",
                        unit_eselon_ii="Unit A",
                    ),
                    PerformanceKinerjaRecord(
                        nip="123456789012345679",
                        dataset_id=1,
                        nama="Zelda",
                        unit_eselon_ii="Unit A",
                    ),
                    PerformanceKinerjaRecord(
                        nip="123456789012345680",
                        dataset_id=1,
                        nama="Beta",
                        unit_eselon_ii="Unit B",
                    ),
                ]
            )
            session.commit()

        def override_history_db():
            with Session(test_engine) as session:
                yield session

        app.dependency_overrides[get_history_db] = override_history_db
        try:
            with patch.object(service, "_lookup_employee_records", return_value={}):
                client = TestClient(app)
                query = {
                    "page_size": 10,
                    "filters": '{"unit_eselon_ii":"Unit A"}',
                    "sort_by": "nama",
                    "sort_order": "desc",
                }
                response = client.get("/performance/records", params=query)
                export_response = client.get("/performance/exports/records", params=query)
        finally:
            app.dependency_overrides.pop(get_history_db, None)
            test_engine.dispose()

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["total"], 2)
        self.assertEqual(
            [record["nama"] for record in payload["records"]],
            ["Zelda", "Alpha"],
        )
        self.assertEqual(export_response.status_code, 200)
        export_workbook = load_workbook(BytesIO(export_response.content), data_only=True)
        export_sheet = export_workbook["Daftar Pegawai"]
        self.assertEqual(export_sheet.max_row, 3)
        self.assertEqual(export_sheet["A2"].value, "Zelda")
        self.assertEqual(export_sheet["A3"].value, "Alpha")
        export_workbook.close()

    def test_super_admin_can_validate_full_data(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="root",
            name="Root",
            auth_level=3,
        )
        try:
            with patch.object(service, "_lookup_employee_records", return_value=EMPLOYEE):
                response = TestClient(app).post(
                    "/performance/full-data/validate",
                    data={"period": "Q3-2026"},
                    files={"file": ("data.csv", full_csv(), "text/csv")},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "period": "Q3-2026",
                "row_count": 1,
                "unidentified_count": 0,
                "normalized_penalty_count": 0,
            },
        )


if __name__ == "__main__":
    unittest.main()
