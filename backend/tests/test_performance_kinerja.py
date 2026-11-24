import csv
import unittest
from decimal import Decimal
from io import BytesIO, StringIO
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.auth import get_current_user, get_optional_current_user, get_super_admin
from app.history_db import Base, _migrate_performance_schema, get_history_db
from app.models.menu_access import MenuAccessPolicy
from app.models.performance_kinerja import (
    PerformanceCorrectionEditLog,
    PerformanceKinerjaDataset,
    PerformanceKinerjaInsight,
    PerformanceKinerjaRecord,
)
from app.services.kinerja import cache as kinerja_cache
from app.services.kinerja import common as kinerja_common
from app.services.kinerja import corrections as kinerja_corrections
from app.services.kinerja import dashboard as kinerja_dashboard
from app.services.kinerja import exports as kinerja_exports
from app.services.kinerja import records as kinerja_records
from app.services.kinerja import uploads as kinerja_uploads
from main import app


NIP = "123456789012345678"
EMPLOYEE = {
    NIP: {
        "nama": "Pegawai Contoh",
        "unit_eselon_ii": "Direktorat Contoh",
        "unit_eselon_iii": "Subdirektorat Contoh",
        "unit_eselon_iv": "Seksi Contoh",
        "eselon": "III",
        "unit_kerja_id": 10,
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
    writer.writerow(kinerja_common.FULL_DATA_HEADERS)
    writer.writerow(row)
    return output.getvalue().encode("utf-8")


def correction_batch_xlsx(
    rows: list[tuple[object, object]],
    headers: tuple[str, str] = ("nip", "nilai_koreksi"),
) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.append(headers)
    for row in rows:
        worksheet.append(row)
    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


class PerformanceKinerjaServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[
                PerformanceCorrectionEditLog.__table__,
                PerformanceKinerjaDataset.__table__,
                PerformanceKinerjaRecord.__table__,
            ],
        )
        self.session = Session(self.engine)
        self.employee_lookup_patcher = patch.object(
            kinerja_uploads,
            "_lookup_employee_records",
            return_value=EMPLOYEE,
        )
        self.employee_lookup = self.employee_lookup_patcher.start()
        self.addCleanup(self.employee_lookup_patcher.stop)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.session.close)

    def import_active_dataset(self) -> None:
        kinerja_uploads.replace_full_upload(
            self.session,
            full_csv(),
            "Q3-2026",
            uploaded_by_user="admin",
            uploaded_by_name="Admin",
        )

    def get_dataset(self, period: str) -> PerformanceKinerjaDataset | None:
        return self.session.scalar(
            select(PerformanceKinerjaDataset).where(
                PerformanceKinerjaDataset.period == period
            )
        )

    def get_record(
        self,
        nip: str,
        period: str | None = None,
    ) -> PerformanceKinerjaRecord | None:
        dataset = (
            self.get_dataset(period)
            if period is not None
            else self.session.scalar(
                select(PerformanceKinerjaDataset).order_by(
                    PerformanceKinerjaDataset.id.desc()
                )
            )
        )
        if dataset is None:
            return None
        return self.session.get(PerformanceKinerjaRecord, (dataset.id, nip))

    def test_full_import_normalizes_nip_and_preserves_source_scores(self) -> None:
        content = full_csv(
            nip=f"\t {NIP}",
            nhk="80,0",
            npk="100,0",
            nkp_awal="84",
            nkp_akhir="119",
        )
        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value=EMPLOYEE):
            result = kinerja_uploads.validate_full_upload(content, "q3-2026")

        self.assertEqual(
            result,
            {
                "period": "Q3-2026",
                "row_count": 1,
                "unidentified_count": 0,
                "normalized_penalty_count": 0,
            },
        )
        kinerja_uploads.replace_full_upload(
            self.session,
            content,
            "Q3-2026",
            uploaded_by_user="admin",
            uploaded_by_name="Admin",
        )
        record = self.get_record(NIP, "Q3-2026")
        self.assertEqual(record.nkp_awal, 84)
        self.assertEqual(record.nkp_perhitungan, Decimal("84.6000000000"))
        self.assertEqual(record.status_nkp_perhitungan, "Rendah")
        self.assertEqual(record.nkp_akhir, 119)
        self.assertEqual(record.unit_eselon_iii, "Subdirektorat Contoh")
        self.assertEqual(record.unit_eselon_iv, "Seksi Contoh")
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
                self.assertEqual(kinerja_common.get_status(Decimal(value)), expected)
        self.assertEqual(kinerja_common.get_status(None), "Tidak tersedia")

    def test_nkp_perhitungan_uses_nko_weighting_and_existing_bands(self) -> None:
        above_nko = kinerja_common._calculate_nkp_perhitungan(
            Decimal("120"),
            Decimal("100"),
        )
        below_nko = kinerja_common._calculate_nkp_perhitungan(
            Decimal("100"),
            Decimal("120"),
        )

        self.assertEqual(above_nko, Decimal("114.00"))
        self.assertEqual(below_nko, Decimal("102.00"))
        self.assertEqual(kinerja_common.get_status(above_nko), "Istimewa")
        self.assertEqual(kinerja_common.get_status(below_nko), "Tinggi")
        self.assertIsNone(
            kinerja_common._calculate_nkp_perhitungan(None, Decimal("120"))
        )

    def test_nkp_perhitungan_status_uses_displayed_two_decimal_score(self) -> None:
        self.assertEqual(
            kinerja_common._get_nkp_perhitungan_status(Decimal("114.998")),
            "Sangat Istimewa",
        )
        self.assertEqual(
            kinerja_common._get_nkp_perhitungan_status(Decimal("114.994")),
            "Istimewa",
        )
        self.assertEqual(kinerja_common._get_nkp_perhitungan_status(None), "Tidak tersedia")

    def test_full_import_status_uses_displayed_nkp_perhitungan(self) -> None:
        kinerja_uploads.replace_full_upload(
            self.session,
            full_csv(nkp_awal="114.51", nko="119.39"),
            "Q3-2026",
            uploaded_by_user="admin",
            uploaded_by_name="Admin",
        )

        record = self.get_record(NIP, "Q3-2026")
        self.assertEqual(record.nkp_perhitungan, Decimal("114.9980000000"))
        self.assertEqual(record.status_nkp_perhitungan, "Sangat Istimewa")

    def test_full_import_rejects_duplicate_nips_without_replacing_data(self) -> None:
        self.import_active_dataset()
        existing = self.get_record(NIP, "Q3-2026")
        self.assertEqual(existing.nama, "Pegawai Contoh")

        duplicate_csv = full_csv() + full_csv().split(b"\n", 1)[1]
        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value=EMPLOYEE):
            with self.assertRaisesRegex(ValueError, "Duplicate NIPs"):
                kinerja_uploads.replace_full_upload(
                    self.session,
                    duplicate_csv,
                    "Q4-2026",
                    uploaded_by_user="admin",
                    uploaded_by_name="Admin",
                )
        self.assertEqual(self.get_dataset("Q3-2026").period, "Q3-2026")

        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value={}):
            result = kinerja_uploads.replace_full_upload(
                self.session,
                full_csv(nip="1234567890123456", hukdis="26"),
                "Q4-2026",
                uploaded_by_user="admin",
                uploaded_by_name="Admin",
            )
        self.assertEqual(result["unidentified_count"], 1)
        unmatched = self.get_record("1234567890123456", "Q4-2026")
        self.assertEqual(unmatched.unit_eselon_ii, "Unidentified")
        self.assertEqual(unmatched.eselon, "Unidentified")
        self.assertEqual(unmatched.nilai_hukuman_disiplin, -26)
        self.assertEqual(self.get_dataset("Q4-2026").period, "Q4-2026")
        self.assertEqual(self.get_dataset("Q3-2026").period, "Q3-2026")

    def test_quarter_uploads_are_retained_and_same_period_replacement_is_isolated(self) -> None:
        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value=EMPLOYEE):
            kinerja_uploads.replace_full_upload(
                self.session,
                full_csv(npk="80", nkp_akhir="89"),
                "Q2-2026",
                uploaded_by_user="admin",
                uploaded_by_name="Admin",
            )
            kinerja_uploads.replace_full_upload(
                self.session,
                full_csv(npk="100", nkp_akhir="100"),
                "Q3-2026",
                uploaded_by_user="admin",
                uploaded_by_name="Admin",
            )

        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value=EMPLOYEE) as lookup:
            dashboard = kinerja_dashboard.get_dashboard(self.session, None, [], "Q3-2026")
            unit = dashboard["units"][0]
            comparison = unit["comparison"]

            self.assertEqual(dashboard["previous_period"], "Q2-2026")
            self.assertEqual(comparison["average_npk"]["current"], 100)
            self.assertEqual(comparison["average_npk"]["previous"], 80)
            self.assertEqual(comparison["average_npk"]["delta"], 20)
            self.assertEqual(comparison["average_npk"]["percentage_change"], 25)
            self.assertEqual(
                dashboard["overview_comparison"]["average_npk"]["current"],
                100,
            )
            self.assertEqual(
                dashboard["overview_comparison"]["average_npk"]["previous"],
                80,
            )
            self.assertEqual(
                dashboard["overview_previous"]["employee_count"],
                1,
            )
            unit_iii = dashboard["units"][0]["children"][0]
            unit_iv = unit_iii["children"][0]
            self.assertEqual(unit_iii["comparison"]["average_npk"]["delta"], 20)
            self.assertEqual(unit_iv["comparison"]["average_npk"]["delta"], 20)
            self.assertEqual(
                comparison["nkp_akhir_status_counts.Rendah"]["delta"],
                -1,
            )
            self.assertEqual(
                comparison["nkp_akhir_status_counts.Rendah"]["percentage_change"],
                -100,
            )
            kinerja_dashboard.get_dashboard(self.session, None, [], "Q3-2026")
            self.assertEqual(lookup.call_count, 0)

            kinerja_uploads.replace_full_upload(
                self.session,
                full_csv(npk="90", nkp_akhir="90"),
                "Q2-2026",
                uploaded_by_user="admin",
                uploaded_by_name="Admin",
            )

            updated = kinerja_dashboard.get_dashboard(self.session, None, [], "Q3-2026")
            self.assertEqual(updated["available_periods"][0]["period"], "Q2-2026")
            self.assertEqual(updated["available_periods"][1]["period"], "Q3-2026")
            self.assertEqual(updated["units"][0]["comparison"]["average_npk"]["previous"], 90)
            self.assertEqual(self.get_record(NIP, "Q3-2026").npk, 100)
            self.assertEqual(self.get_record(NIP, "Q2-2026").npk, 90)
            self.assertEqual(lookup.call_count, 1)

    def test_comparison_requires_the_immediately_previous_calendar_quarter(self) -> None:
        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value=EMPLOYEE):
            for period in ("Q1-2026", "Q3-2026"):
                kinerja_uploads.replace_full_upload(
                    self.session,
                    full_csv(),
                    period,
                    uploaded_by_user="admin",
                    uploaded_by_name="Admin",
                )

            dashboard = kinerja_dashboard.get_dashboard(self.session, None, [])

        self.assertEqual(dashboard["dataset"]["period"], "Q3-2026")
        self.assertIsNone(dashboard["previous_period"])
        self.assertIsNone(dashboard["overview_previous"])
        self.assertEqual(dashboard["overview_comparison"], {})
        self.assertEqual(dashboard["units"][0]["comparison"], {})

    def test_overview_comparison_applies_selected_filters_to_both_periods(self) -> None:
        self.import_active_dataset()
        current_record = self.get_record(NIP, "Q3-2026")
        current_record.unit_eselon_ii = "Unit A"
        current_record.unit_eselon_iii = "Subunit A"
        current_record.unit_eselon_iv = "Section A"
        current_record.eselon = "III"
        current_record.npk = Decimal("100")
        current_record.nkp_akhir = Decimal("115")
        current_record.nilai_koreksi = Decimal("0")
        self.session.commit()
        current_dataset = self.get_dataset("Q3-2026")
        self.session.add(
            PerformanceKinerjaRecord(
                nip="123456789012345681",
                dataset_id=current_dataset.id,
                nama="Pegawai Subunit B",
                unit_eselon_ii="Unit A",
                unit_eselon_iii="Subunit B",
                unit_eselon_iv="Section A",
                eselon="III",
            )
        )
        current_dataset.row_count = 2

        kinerja_uploads.replace_full_upload(
            self.session,
            full_csv(npk="80", nkp_akhir="90", koreksi="2"),
            "Q2-2026",
            uploaded_by_user="admin",
            uploaded_by_name="Admin",
        )
        previous_record = self.get_record(NIP, "Q2-2026")
        previous_record.unit_eselon_ii = "Unit A"
        previous_record.unit_eselon_iii = "Subunit A"
        previous_record.unit_eselon_iv = "Section A"
        previous_record.eselon = "III"
        previous_dataset = self.get_dataset("Q2-2026")
        self.session.add(
            PerformanceKinerjaRecord(
                nip="123456789012345679",
                dataset_id=previous_dataset.id,
                nama="Pegawai Unit B",
                unit_eselon_ii="Unit B",
                eselon="IV",
                npk=Decimal("120"),
                nkp_akhir=Decimal("89"),
                nilai_koreksi=Decimal("3"),
            )
        )
        self.session.add(
            PerformanceKinerjaRecord(
                nip="123456789012345682",
                dataset_id=previous_dataset.id,
                nama="Pegawai Seksi B",
                unit_eselon_ii="Unit A",
                unit_eselon_iii="Subunit A",
                unit_eselon_iv="Section B",
                eselon="III",
            )
        )
        previous_dataset.row_count = 3
        self.session.commit()

        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value=EMPLOYEE):
            dashboard = kinerja_dashboard.get_dashboard(
                self.session,
                "Unit A",
                ["III"],
                "Q3-2026",
                unit_eselon_iii="Subunit A",
                unit_eselon_iv="Section A",
            )

        self.assertEqual(dashboard["overview"]["employee_count"], 1)
        self.assertEqual(dashboard["overview_previous"]["employee_count"], 1)
        self.assertEqual(dashboard["unit_eselon_ii_options"], ["Unit A"])
        self.assertEqual(
            dashboard["unit_eselon_iii_options"],
            ["Subunit A", "Subunit B"],
        )
        self.assertEqual(dashboard["unit_eselon_iv_options"], ["Section A"])
        self.assertEqual(dashboard["eselon_options"], ["III"])
        self.assertEqual(
            dashboard["overview_comparison"]["employee_count"]["current"],
            1,
        )
        self.assertEqual(
            dashboard["overview_comparison"]["employee_count"]["previous"],
            1,
        )
        self.assertEqual(
            dashboard["overview_comparison"]["correction.count"]["delta"],
            -1,
        )
        self.assertEqual(
            dashboard["overview_comparison"]["nkp_akhir_status_counts.Sedang"]["previous"],
            1,
        )
        self.assertEqual(
            sum(bin_["count"] for bin_ in dashboard["overview_previous"]["histogram"]),
            1,
        )

    def test_performance_schema_migration_preserves_existing_period_data(self) -> None:
        legacy_engine = create_engine("sqlite:///:memory:")
        self.addCleanup(legacy_engine.dispose)
        with legacy_engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE performance_kinerja_datasets ("
                "id INTEGER PRIMARY KEY, period VARCHAR(7) NOT NULL, "
                "row_count INTEGER NOT NULL, uploaded_at DATETIME NOT NULL, "
                "uploaded_by_user VARCHAR(80) NOT NULL, uploaded_by_name VARCHAR(200) NOT NULL)"
            )
            connection.exec_driver_sql(
                "INSERT INTO performance_kinerja_datasets VALUES "
                "(1, 'Q3-2026', 2, '2026-09-01 00:00:00', 'admin', 'Admin')"
            )
            connection.exec_driver_sql(
                "CREATE TABLE performance_kinerja_records ("
                "nip VARCHAR(18) PRIMARY KEY NOT NULL, dataset_id INTEGER NOT NULL, "
                "nama TEXT NOT NULL, nkp_awal NUMERIC(18, 8), nko NUMERIC(18, 8))"
            )
            connection.exec_driver_sql(
                "INSERT INTO performance_kinerja_records "
                "(nip, dataset_id, nama, nkp_awal, nko) VALUES "
                f"('{NIP}', 1, 'Pegawai Lama', 120, 100)"
            )
            connection.exec_driver_sql(
                "INSERT INTO performance_kinerja_records "
                "(nip, dataset_id, nama, nkp_awal, nko) VALUES "
                "('123456789012345679', 1, 'Pegawai Ambang', 114.51, 119.39)"
            )

        _migrate_performance_schema(legacy_engine)

        self.assertEqual(
            inspect(legacy_engine)
            .get_pk_constraint("performance_kinerja_records")["constrained_columns"],
            ["dataset_id", "nip"],
        )
        unique_period_indexes = inspect(legacy_engine).get_indexes(
            "performance_kinerja_datasets"
        )
        self.assertTrue(
            any(
                index["unique"] and index["column_names"] == ["period"]
                for index in unique_period_indexes
            )
        )
        with Session(legacy_engine) as session:
            record = session.get(PerformanceKinerjaRecord, (1, NIP))
            self.assertEqual(record.nama, "Pegawai Lama")
            self.assertEqual(record.unit_eselon_iv, "Unidentified")
            self.assertIsNone(record.unit_kerja_id)
            self.assertEqual(record.nkp_perhitungan, Decimal("114.0000000000"))
            self.assertEqual(record.status_nkp_perhitungan, "Istimewa")
            boundary_record = session.get(
                PerformanceKinerjaRecord,
                (1, "123456789012345679"),
            )
            self.assertEqual(boundary_record.status_nkp_perhitungan, "Sangat Istimewa")
            migrated_dataset = session.get(PerformanceKinerjaDataset, 1)
            self.assertEqual(migrated_dataset.period, "Q3-2026")

        with legacy_engine.begin() as connection:
            connection.exec_driver_sql(
                "UPDATE performance_kinerja_records "
                "SET status_nkp_perhitungan = 'Istimewa' "
                "WHERE nip = '123456789012345679'"
            )
        _migrate_performance_schema(legacy_engine)
        with Session(legacy_engine) as session:
            boundary_record = session.get(
                PerformanceKinerjaRecord,
                (1, "123456789012345679"),
            )
            self.assertEqual(boundary_record.status_nkp_perhitungan, "Sangat Istimewa")

    def test_employee_lookup_supports_current_and_q2_sources_with_eselon_iv(self) -> None:
        self.employee_lookup_patcher.stop()
        employee_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(employee_engine.dispose)
        with employee_engine.begin() as connection:
            connection.exec_driver_sql("ATTACH DATABASE ':memory:' AS pbncleaner")
            connection.exec_driver_sql(
                'CREATE TABLE pbncleaner.ref_eselon ('
                '"eselon_id" INTEGER, "value" TEXT)'
            )
            connection.exec_driver_sql(
                "INSERT INTO pbncleaner.ref_eselon VALUES (1, 'IV'), (2, 'III')"
            )
            connection.exec_driver_sql(
                'CREATE TABLE pbncleaner.ref_unit_kerja ('
                '"unit_kerja_id" INTEGER, "value" TEXT)'
            )
            connection.exec_driver_sql(
                "INSERT INTO pbncleaner.ref_unit_kerja VALUES "
                "(10, 'Direktorat Utama'), "
                "(20, 'Direktorat Q2')"
            )
            connection.exec_driver_sql(
                'CREATE TABLE pbncleaner.fetch_pbnopen ('
                '"NIP" TEXT, "Nama Gelar" TEXT, "Unit Eselon II" TEXT, '
                '"Unit Eselon III" TEXT, "Unit Eselon IV" TEXT, "eselon" TEXT, '
                '"Unit Kerja" TEXT)'
            )
            connection.exec_driver_sql(
                "INSERT INTO pbncleaner.fetch_pbnopen VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    NIP,
                    "Pegawai Utama",
                    "Direktorat Utama",
                    "Subdirektorat Contoh",
                    "Seksi Utama",
                    "IV",
                    "Direktorat Utama",
                ),
            )
            connection.exec_driver_sql(
                'CREATE TABLE pbncleaner.dt_employee_q2_2026 ('
                '"NIP" TEXT, "Nama Gelar" TEXT, "Unit Eselon II" TEXT, '
                '"Unit Eselon III" TEXT, "Unit Eselon IV" TEXT, '
                '"eselon_id" INTEGER, "unit_kerja_id" INTEGER)'
            )
            connection.exec_driver_sql(
                "INSERT INTO pbncleaner.dt_employee_q2_2026 VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    NIP,
                    "Pegawai Q2",
                    "Direktorat Q2",
                    "Subdirektorat Contoh",
                    "Seksi Q2",
                    2,
                    20,
                ),
            )

        with patch.object(kinerja_uploads, "engine", employee_engine):
            employees = kinerja_uploads._lookup_employee_records({NIP})
            q2_employees = kinerja_uploads._lookup_employee_records(
                {NIP},
                employee_source="dt_employee_q2_2026",
            )

        self.assertEqual(employees[NIP]["unit_eselon_iv"], "Seksi Utama")
        self.assertEqual(employees[NIP]["nama"], "Pegawai Utama")
        self.assertEqual(employees[NIP]["eselon"], "IV")
        self.assertEqual(employees[NIP]["unit_kerja_id"], 10)
        self.assertEqual(q2_employees[NIP]["nama"], "Pegawai Q2")
        self.assertEqual(q2_employees[NIP]["unit_eselon_iv"], "Seksi Q2")
        self.assertEqual(q2_employees[NIP]["eselon"], "III")
        self.assertEqual(q2_employees[NIP]["unit_kerja_id"], 20)

    def test_employee_lookup_rejects_unallowlisted_reference_source(self) -> None:
        self.employee_lookup_patcher.stop()
        with self.assertRaisesRegex(ValueError, "Employee source"):
            kinerja_uploads._lookup_employee_records({NIP}, employee_source="dt_employee")

    def test_full_dataset_replacement_uses_selected_employee_source(self) -> None:
        q2_employee = {
            NIP: {
                **EMPLOYEE[NIP],
                "nama": "Pegawai Q2 Referensi",
                "unit_eselon_ii": "Direktorat Q2",
                "unit_eselon_iii": "Subdirektorat Q2",
                "unit_eselon_iv": "Seksi Q2",
            }
        }
        with patch.object(
            kinerja_uploads,
            "_lookup_employee_records",
            return_value=q2_employee,
        ) as employee_lookup:
            result = kinerja_uploads.replace_full_upload(
                self.session,
                full_csv(),
                "Q2-2026",
                uploaded_by_user="admin",
                uploaded_by_name="Admin",
                employee_source="dt_employee_q2_2026",
            )

        self.assertEqual(result["period"], "Q2-2026")
        employee_lookup.assert_called_once_with(
            {NIP},
            employee_source="dt_employee_q2_2026",
        )
        record = self.get_record(NIP, "Q2-2026")
        self.assertEqual(record.nama, "Pegawai Q2 Referensi")
        self.assertEqual(record.unit_eselon_ii, "Direktorat Q2")
        dashboard = kinerja_dashboard.get_dashboard(self.session, None, [], "Q2-2026")
        self.assertEqual(dashboard["units"][0]["label"], "Direktorat Q2")
        records = kinerja_records.get_records(
            self.session,
            page=1,
            page_size=50,
            search="",
            period="Q2-2026",
        )
        self.assertEqual(records["records"][0]["nama"], "Pegawai Q2 Referensi")
        self.assertEqual(records["records"][0]["unit_eselon_ii"], "Direktorat Q2")

    def test_positive_penalty_magnitudes_are_normalized_and_reported(self) -> None:
        content = full_csv(
            nip="1234567890123456",
            hukdis="26",
            dampak_pelanggaran="2",
            dampak_perilaku="1",
        )
        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value={}):
            result = kinerja_uploads.validate_full_upload(content, "Q3-2026")
        self.assertEqual(result["unidentified_count"], 1)
        self.assertEqual(result["normalized_penalty_count"], 3)
        parsed = kinerja_uploads._read_full_csv(content)[0]
        self.assertEqual(parsed["nilai_hukuman_disiplin"], -26)
        self.assertEqual(parsed["nilai_dampak_pelanggaran_disiplin"], -2)
        self.assertEqual(parsed["nilai_dampak_perilaku"], -1)

    def test_invalid_decimal_and_range_are_reported_with_nip(self) -> None:
        with self.assertRaisesRegex(ValueError, "NPK must be between 0 and 120"):
            kinerja_uploads._read_full_csv(full_csv(npk="121"))
        with self.assertRaisesRegex(ValueError, f"NIP {NIP}.*Nilai Koreksi"):
            kinerja_uploads._read_full_csv(full_csv(koreksi="21"))

    def test_epride_filter_ignores_long_unit_ids_and_resolves_zero_duplicates(self) -> None:
        other_nip = "223456789012345678"
        result = kinerja_corrections._prepare_epride_corrections(
            [
                {
                    "form_id": 1,
                    "id_unit": "1234567890123",
                    "nip": NIP,
                    "nilai_koreksi": "0",
                },
                {
                    "form_id": 2,
                    "id_unit": "1234567890123",
                    "nip": NIP,
                    "nilai_koreksi": "-3",
                },
                {
                    "form_id": 3,
                    "id_unit": "1234567890123",
                    "nip": other_nip,
                    "nilai_koreksi": None,
                },
                {
                    "id_unit": "123456789012345",
                    "nip": "323456789012345678",
                    "nilai_koreksi": "115",
                },
            ],
            2026,
            2,
        )

        self.assertEqual(
            result,
            {
                "corrections": {
                    NIP: Decimal("-3"),
                    other_nip: kinerja_common.ZERO,
                },
                "conflicts": [],
                "source_row_count": 3,
                "source_nip_count": 2,
                "duplicate_nip_group_count": 1,
                "ignored_unit_row_count": 1,
            },
        )

    def test_available_epride_source_periods_are_grouped_and_sorted(self) -> None:
        with patch.object(
            kinerja_corrections,
            "fetch_epride_available_source_periods",
            return_value=[
                {"year": 2025, "tw": 4},
                {"year": 2026, "tw": 3},
                {"year": 2026, "tw": 2},
            ],
        ):
            result = kinerja_corrections.get_available_epride_source_periods()

        self.assertEqual(
            result,
            [
                {"year": 2026, "available_tw": [2, 3]},
                {"year": 2025, "available_tw": [4]},
            ],
        )

    def test_epride_sync_updates_matched_and_zeroes_unmatched_records(self) -> None:
        other_nip = "223456789012345678"
        self.import_active_dataset()
        kinerja_corrections.update_manual_correction(
            self.session,
            "Q3-2026",
            NIP,
            Decimal("3"),
            edited_by_user="admin",
            edited_by_name="Admin",
        )
        dataset = self.get_dataset("Q3-2026")
        self.session.add(
            PerformanceKinerjaRecord(
                dataset_id=dataset.id,
                nip=other_nip,
                nama="Pegawai Tidak Cocok",
                nkp_awal=Decimal("85"),
                nilai_hukuman_disiplin=kinerja_common.ZERO,
                nilai_dampak_pelanggaran_disiplin=kinerja_common.ZERO,
                nilai_koreksi=Decimal("7"),
                nko=Decimal("90"),
                nkp_akhir=Decimal("90"),
            )
        )
        dataset.row_count = 2
        self.session.commit()

        with patch.object(
            kinerja_corrections,
            "fetch_submitted_correction_rows",
            return_value=[
                {
                    "form_id": 17,
                    "id_unit": "1234567890123",
                    "nip": NIP,
                    "nilai_koreksi": "2",
                }
            ],
        ) as fetch_rows:
            result = kinerja_corrections.sync_adjustments_from_epride(
                self.session,
                "Q3-2026",
                2026,
                2,
                {},
            )
        fetch_rows.assert_called_once_with(year=2026, quarter=2)

        matched = self.get_record(NIP, "Q3-2026")
        unmatched = self.get_record(other_nip, "Q3-2026")
        self.assertEqual(result["row_count"], 2)
        self.assertEqual(result["source_year"], 2026)
        self.assertEqual(result["source_tw"], 2)
        self.assertEqual(result["source_row_count"], 1)
        self.assertEqual(result["matched_count"], 1)
        self.assertEqual(result["unmatched_count"], 1)
        self.assertEqual(matched.nilai_koreksi, Decimal("2"))
        self.assertEqual(matched.nkp_akhir, Decimal("84.6"))
        self.assertEqual(unmatched.nilai_koreksi, kinerja_common.ZERO)
        self.assertEqual(unmatched.nkp_akhir, Decimal("85.5"))
        self.assertEqual(
            self.session.scalars(select(PerformanceCorrectionEditLog)).all(),
            [],
        )

    def test_manual_correction_edit_recalculates_and_records_editor(self) -> None:
        self.import_active_dataset()

        result = kinerja_corrections.update_manual_correction(
            self.session,
            "Q3-2026",
            NIP,
            Decimal("2.75"),
            edited_by_user="admin",
            edited_by_name="Admin User",
        )

        record = self.get_record(NIP, "Q3-2026")
        log = self.session.scalar(select(PerformanceCorrectionEditLog))
        expected_score = kinerja_common.calculate_nkp_akhir(
            record.nkp_awal,
            record.nko,
            record.nilai_hukuman_disiplin,
            record.nilai_dampak_pelanggaran_disiplin,
            Decimal("2.75"),
        )
        self.assertTrue(result["changed"])
        self.assertEqual(record.nilai_koreksi, Decimal("2.75"))
        self.assertEqual(record.nkp_akhir, expected_score)
        self.assertEqual(result["nkp_akhir"], kinerja_common._format_decimal(expected_score))
        self.assertEqual(log.period, "Q3-2026")
        self.assertEqual(log.nip, NIP)
        self.assertEqual(log.employee_name, "Pegawai Contoh")
        self.assertEqual(log.old_value, Decimal("1"))
        self.assertEqual(log.new_value, Decimal("2.75"))
        self.assertEqual(log.edited_by_user, "admin")
        self.assertEqual(log.edited_by_name, "Admin User")

    def test_manual_correction_accepts_range_endpoints_and_rejects_outside_values(self) -> None:
        self.import_active_dataset()

        for value in ("-5", "5"):
            with self.subTest(value=value):
                kinerja_corrections.update_manual_correction(
                    self.session,
                    "Q3-2026",
                    NIP,
                    Decimal(value),
                    edited_by_user="admin",
                    edited_by_name="Admin",
                )

        self.assertEqual(
            self.get_record(NIP, "Q3-2026").nilai_koreksi,
            Decimal("5"),
        )
        logs = self.session.scalars(
            select(PerformanceCorrectionEditLog).order_by(
                PerformanceCorrectionEditLog.id
            )
        ).all()
        self.assertEqual(
            [log.new_value for log in logs],
            [Decimal("-5"), Decimal("5")],
        )

        for value in ("-5.00000001", "5.00000001", "1.000000001"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                kinerja_corrections.update_manual_correction(
                    self.session,
                    "Q3-2026",
                    NIP,
                    Decimal(value),
                    edited_by_user="admin",
                    edited_by_name="Admin",
                )

        self.assertEqual(
            self.session.scalars(select(PerformanceCorrectionEditLog)).all(),
            logs,
        )
        self.assertEqual(
            self.get_record(NIP, "Q3-2026").nilai_koreksi,
            Decimal("5"),
        )

    def test_batch_correction_template_contains_two_text_headers(self) -> None:
        workbook = load_workbook(
            BytesIO(kinerja_corrections.create_correction_batch_template()),
            read_only=True,
        )
        try:
            worksheet = workbook.active
            self.assertEqual(
                tuple(cell.value for cell in next(worksheet.iter_rows(max_row=1))),
                ("nip", "nilai_koreksi"),
            )
            self.assertEqual(worksheet["A2"].number_format, "@")
        finally:
            workbook.close()

    def test_batch_correction_normalizes_quoted_nips_recalculates_and_logs_each_change(self) -> None:
        other_nip = "223456789012345678"
        self.import_active_dataset()
        dataset = self.get_dataset("Q3-2026")
        self.session.add(
            PerformanceKinerjaRecord(
                dataset_id=dataset.id,
                nip=other_nip,
                nama="Pegawai Kedua",
                nkp_awal=Decimal("85"),
                nilai_hukuman_disiplin=Decimal("-1"),
                nilai_dampak_pelanggaran_disiplin=Decimal("-2"),
                nilai_koreksi=Decimal("-1"),
                nko=Decimal("90"),
                nkp_akhir=Decimal("80.8"),
            )
        )
        dataset.row_count = 2
        self.session.commit()
        content = correction_batch_xlsx([
            (f"`{NIP}", "2.25"),
            (f"'{other_nip}", "-1,5"),
        ])

        result = kinerja_corrections.update_manual_corrections_from_excel(
            self.session,
            content,
            "Q3-2026",
            edited_by_user="admin",
            edited_by_name="Admin User",
        )

        first_record = self.get_record(NIP, "Q3-2026")
        second_record = self.get_record(other_nip, "Q3-2026")
        logs = self.session.scalars(
            select(PerformanceCorrectionEditLog).order_by(
                PerformanceCorrectionEditLog.id
            )
        ).all()
        self.assertEqual(result, {
            "period": "Q3-2026",
            "input_count": 2,
            "updated_count": 2,
            "unchanged_count": 0,
        })
        self.assertEqual(first_record.nilai_koreksi, Decimal("2.25"))
        self.assertEqual(
            first_record.nkp_akhir,
            kinerja_common.calculate_nkp_akhir(
                first_record.nkp_awal,
                first_record.nko,
                first_record.nilai_hukuman_disiplin,
                first_record.nilai_dampak_pelanggaran_disiplin,
                Decimal("2.25"),
            ),
        )
        self.assertEqual(second_record.nilai_koreksi, Decimal("-1.5"))
        self.assertEqual(
            [(log.nip, log.old_value, log.new_value) for log in logs],
            [
                (NIP, Decimal("1"), Decimal("2.25")),
                (other_nip, Decimal("-1"), Decimal("-1.5")),
            ],
        )
        self.assertTrue(all(log.edited_by_user == "admin" for log in logs))

        no_change_result = kinerja_corrections.update_manual_corrections_from_excel(
            self.session,
            content,
            "Q3-2026",
            edited_by_user="admin",
            edited_by_name="Admin User",
        )
        self.assertEqual(no_change_result["updated_count"], 0)
        self.assertEqual(no_change_result["unchanged_count"], 2)
        self.assertEqual(
            len(self.session.scalars(select(PerformanceCorrectionEditLog)).all()),
            2,
        )

    def test_batch_correction_accepts_range_endpoints(self) -> None:
        other_nip = "223456789012345678"
        self.import_active_dataset()
        dataset = self.get_dataset("Q3-2026")
        self.session.add(
            PerformanceKinerjaRecord(
                dataset_id=dataset.id,
                nip=other_nip,
                nama="Pegawai Kedua",
                nkp_awal=Decimal("85"),
                nilai_hukuman_disiplin=Decimal("-1"),
                nilai_dampak_pelanggaran_disiplin=Decimal("-2"),
                nilai_koreksi=Decimal("-1"),
                nko=Decimal("90"),
                nkp_akhir=Decimal("80.8"),
            )
        )
        dataset.row_count = 2
        self.session.commit()

        result = kinerja_corrections.update_manual_corrections_from_excel(
            self.session,
            correction_batch_xlsx([(NIP, "-5"), (other_nip, "5")]),
            "Q3-2026",
            edited_by_user="admin",
            edited_by_name="Admin User",
        )

        self.assertEqual(result["updated_count"], 2)
        self.assertEqual(
            self.get_record(NIP, "Q3-2026").nilai_koreksi,
            Decimal("-5"),
        )
        self.assertEqual(
            self.get_record(other_nip, "Q3-2026").nilai_koreksi,
            Decimal("5"),
        )

    def test_batch_correction_rejects_invalid_rows_atomically(self) -> None:
        self.import_active_dataset()
        invalid_workbooks = (
            correction_batch_xlsx([
                (NIP, "2"),
                ("223456789012345678", "3"),
            ]),
            correction_batch_xlsx([
                (NIP, "2"),
                (NIP, "3"),
            ]),
            correction_batch_xlsx([
                (NIP, "-5.00000001"),
            ]),
            correction_batch_xlsx([
                (NIP, "5.00000001"),
            ]),
            correction_batch_xlsx([
                (123456789012345678, "2"),
            ]),
            correction_batch_xlsx(
                [(NIP, "2")],
                headers=("employee_nip", "nilai_koreksi"),
            ),
        )

        for content in invalid_workbooks:
            with self.subTest(content=content[:12]), self.assertRaises(ValueError):
                kinerja_corrections.update_manual_corrections_from_excel(
                    self.session,
                    content,
                    "Q3-2026",
                    edited_by_user="admin",
                    edited_by_name="Admin",
                )
            self.assertEqual(
                self.get_record(NIP, "Q3-2026").nilai_koreksi,
                Decimal("1"),
            )
            self.assertEqual(
                self.session.scalars(select(PerformanceCorrectionEditLog)).all(),
                [],
            )

    def test_undo_removes_later_edits_for_only_the_selected_period_and_nip(self) -> None:
        self.import_active_dataset()
        kinerja_uploads.replace_full_upload(
            self.session,
            full_csv(),
            "Q4-2026",
            uploaded_by_user="admin",
            uploaded_by_name="Admin",
        )
        kinerja_corrections.update_manual_correction(
            self.session, "Q3-2026", NIP, Decimal("2"), "admin", "Admin"
        )
        kinerja_corrections.update_manual_correction(
            self.session, "Q3-2026", NIP, Decimal("3"), "admin", "Admin"
        )
        kinerja_corrections.update_manual_correction(
            self.session, "Q3-2026", NIP, Decimal("4"), "admin", "Admin"
        )
        kinerja_corrections.update_manual_correction(
            self.session, "Q4-2026", NIP, Decimal("2"), "admin", "Admin"
        )
        selected_log = self.session.scalar(
            select(PerformanceCorrectionEditLog).where(
                PerformanceCorrectionEditLog.period == "Q3-2026",
                PerformanceCorrectionEditLog.new_value == Decimal("3"),
            )
        )

        result = kinerja_corrections.undo_manual_correction(self.session, selected_log.id)

        remaining_logs = self.session.scalars(
            select(PerformanceCorrectionEditLog).order_by(
                PerformanceCorrectionEditLog.id
            )
        ).all()
        self.assertEqual(result["period"], "Q3-2026")
        self.assertEqual(result["nilai_koreksi"], 2.0)
        self.assertEqual(
            self.get_record(NIP, "Q3-2026").nilai_koreksi,
            Decimal("2"),
        )
        self.assertEqual(
            self.get_record(NIP, "Q4-2026").nilai_koreksi,
            Decimal("2"),
        )
        self.assertEqual(
            [(log.period, log.new_value) for log in remaining_logs],
            [("Q3-2026", Decimal("2")), ("Q4-2026", Decimal("2"))],
        )

    def test_full_upload_clears_correction_edit_history_and_failed_upload_keeps_it(self) -> None:
        self.import_active_dataset()
        kinerja_corrections.update_manual_correction(
            self.session, "Q3-2026", NIP, Decimal("2"), "admin", "Admin"
        )

        with self.assertRaises(ValueError):
            kinerja_uploads.replace_full_upload(
                self.session,
                b"not a valid performance CSV",
                "Q3-2026",
                uploaded_by_user="admin",
                uploaded_by_name="Admin",
            )
        self.assertEqual(
            len(self.session.scalars(select(PerformanceCorrectionEditLog)).all()),
            1,
        )

        kinerja_uploads.replace_full_upload(
            self.session,
            full_csv(),
            "Q3-2026",
            uploaded_by_user="admin",
            uploaded_by_name="Admin",
        )
        self.assertEqual(
            self.session.scalars(select(PerformanceCorrectionEditLog)).all(),
            [],
        )

    def test_failed_epride_sync_keeps_correction_edit_history(self) -> None:
        self.import_active_dataset()
        kinerja_corrections.update_manual_correction(
            self.session, "Q3-2026", NIP, Decimal("2"), "admin", "Admin"
        )

        with (
            patch.object(
                kinerja_corrections,
                "fetch_submitted_correction_rows",
                side_effect=RuntimeError("EPRIDE is unavailable"),
            ),
            self.assertRaises(RuntimeError),
        ):
            kinerja_corrections.sync_adjustments_from_epride(
                self.session,
                "Q3-2026",
                2026,
                2,
                {},
            )

        self.assertEqual(
            len(self.session.scalars(select(PerformanceCorrectionEditLog)).all()),
            1,
        )

    def test_epride_check_reports_sync_plan_without_changing_csv_values(self) -> None:
        self.import_active_dataset()
        record = self.get_record(NIP, "Q3-2026")
        original_correction = record.nilai_koreksi
        original_score = record.nkp_akhir
        with patch.object(
            kinerja_corrections,
            "fetch_submitted_correction_rows",
            return_value=[
                {
                    "form_id": 18,
                    "id_unit": "1234567890123",
                    "nip": NIP,
                    "nilai_koreksi": "-2",
                }
            ],
        ):
            preview = kinerja_corrections.check_adjustments_from_epride(
                self.session,
                "Q3-2026",
                2025,
                4,
            )

        self.assertEqual(preview["period"], "Q3-2026")
        self.assertEqual(preview["source_year"], 2025)
        self.assertEqual(preview["source_tw"], 4)
        self.assertEqual(preview["source_row_count"], 1)
        self.assertEqual(preview["source_nip_count"], 1)
        self.assertEqual(preview["matched_count"], 1)
        self.assertEqual(preview["unmatched_count"], 0)
        self.assertEqual(record.nilai_koreksi, original_correction)
        self.assertEqual(record.nkp_akhir, original_score)

    def test_nkp_akhir_formula_weights_adjusted_base_against_nko(self) -> None:
        nko_above_adjusted_base = Decimal("98")

        self.assertEqual(
            kinerja_common.calculate_nkp_akhir(
                Decimal("100"),
                Decimal("90"),
                Decimal("-5"),
                Decimal("-2"),
                Decimal("3"),
            ),
            Decimal("94.20"),
        )
        self.assertEqual(
            kinerja_common.calculate_nkp_akhir(
                Decimal("100"),
                nko_above_adjusted_base,
                Decimal("5"),
                Decimal("2"),
                Decimal("3"),
            ),
            Decimal("96.20"),
        )

    def test_epride_conflicts_require_and_apply_per_nip_choices(self) -> None:
        self.import_active_dataset()
        record = self.get_record(NIP, "Q3-2026")
        original_correction = record.nilai_koreksi
        original_score = record.nkp_akhir
        with patch.object(
            kinerja_corrections,
            "fetch_submitted_correction_rows",
            return_value=[
                {
                    "form_id": 21,
                    "submitted_at": "2026-04-15 10:30:00",
                    "id_unit": "1234567890123",
                    "nip": NIP,
                    "nilai_koreksi": "1",
                },
                {
                    "form_id": 22,
                    "submitted_at": "2026-04-16 10:30:00",
                    "id_unit": "1234567890123",
                    "nip": NIP,
                    "nilai_koreksi": "-2",
                },
            ],
        ):
            preview = kinerja_corrections.check_adjustments_from_epride(
                self.session,
                "Q3-2026",
                2026,
                2,
            )
            self.assertEqual(len(preview["conflicts"]), 1)
            self.assertEqual(preview["conflicts"][0]["nip"], NIP)
            self.assertEqual(
                [candidate["value"] for candidate in preview["conflicts"][0]["candidates"]],
                ["-2", "1"],
            )
            chosen_candidate = next(
                candidate
                for candidate in preview["conflicts"][0]["candidates"]
                if candidate["value"] == "-2"
            )
            self.assertEqual(
                chosen_candidate["sources"],
                [
                    {
                        "form_id": "22",
                        "id_unit": "1234567890123",
                        "submitted_at": "2026-04-16 10:30:00",
                    },
                ],
            )
            with self.assertRaisesRegex(ValueError, "Choose exactly one"):
                kinerja_corrections.sync_adjustments_from_epride(
                    self.session,
                    "Q3-2026",
                    2026,
                    2,
                    {},
                )
            self.assertEqual(record.nilai_koreksi, original_correction)
            self.assertEqual(record.nkp_akhir, original_score)

            result = kinerja_corrections.sync_adjustments_from_epride(
                self.session,
                "Q3-2026",
                2026,
                2,
                {NIP: "-2"},
            )

        self.assertEqual(result["resolved_conflict_count"], 1)
        self.assertEqual(self.get_record(NIP, "Q3-2026").nilai_koreksi, Decimal("-2"))

    def test_epride_sync_rejects_stale_conflict_choices(self) -> None:
        self.import_active_dataset()
        with patch.object(
            kinerja_corrections,
            "fetch_submitted_correction_rows",
            return_value=[
                {"form_id": 21, "id_unit": "1234567890123", "nip": NIP, "nilai_koreksi": "1"},
                {"form_id": 22, "id_unit": "1234567890123", "nip": NIP, "nilai_koreksi": "-2"},
            ],
        ):
            with self.assertRaisesRegex(ValueError, "no longer matches"):
                kinerja_corrections.sync_adjustments_from_epride(
                    self.session,
                    "Q3-2026",
                    2026,
                    2,
                    {NIP: "3"},
                )

    def test_epride_sync_blocks_out_of_range_values_and_empty_filtered_sources(self) -> None:
        with self.assertRaisesRegex(ValueError, "outside -20 to 20"):
            kinerja_corrections._prepare_epride_corrections(
                [{"id_unit": "1234567890123", "nip": NIP, "nilai_koreksi": "20.01"}],
                2026,
                2,
            )
        with self.assertRaisesRegex(ValueError, "No submitted EPRIDE corrections"):
            kinerja_corrections._prepare_epride_corrections(
                [{"id_unit": "123456789012345", "nip": NIP, "nilai_koreksi": "0"}],
                2026,
                3,
            )

    def test_analysis_uses_employee_reference_snapshot_and_counts_nonzero_penalties(self) -> None:
        self.import_active_dataset()
        self.employee_lookup.reset_mock()
        result = kinerja_records.get_analysis(self.session, "unit_eselon_ii")
        self.employee_lookup.assert_not_called()
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
                npk=Decimal(value),
            )
            for index, value in enumerate(values, start=1)
        ]
        bins = kinerja_dashboard._make_histogram(records)
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
                    nilai_koreksi=Decimal(value),
                )
            )
        self.get_record(NIP, "Q3-2026").nilai_koreksi = Decimal(values[0])
        result = kinerja_records.get_analysis(self.session, "overall")
        correction = result["groups"][0]["correction"]
        self.assertEqual(correction["count"], 6)
        self.assertEqual(correction["negative_count"], 2)
        self.assertEqual(correction["positive_count"], 4)
        self.assertEqual(correction["average"], 0.4)
        self.assertEqual(correction["minimum"], -2)
        self.assertEqual(correction["maximum"], 3)

    def test_units_default_order_uses_unit_kerja_id_with_missing_ids_last(self) -> None:
        self.import_active_dataset()
        self.session.add_all(
            [
                PerformanceKinerjaRecord(
                    nip="123456789012345679",
                    dataset_id=1,
                    nama="Pegawai ID Rendah",
                    unit_eselon_ii="Unit ID Rendah",
                    unit_kerja_id=2,
                ),
                PerformanceKinerjaRecord(
                    nip="123456789012345680",
                    dataset_id=1,
                    nama="Pegawai tanpa ID",
                    unit_eselon_ii="Unit tanpa ID",
                ),
            ]
        )
        self.session.commit()

        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value={}):
            dashboard = kinerja_dashboard.get_dashboard(self.session, None, [], "Q3-2026")

        self.assertEqual(
            [unit["label"] for unit in dashboard["units"]],
            ["Unit ID Rendah", "Direktorat Contoh", "Unit tanpa ID"],
        )
        self.assertEqual(
            [unit["unit_kerja_id"] for unit in dashboard["units"]],
            [2, 10, None],
        )

    def test_dashboard_applies_overview_filters_and_expands_unit_metrics(self) -> None:
        self.import_active_dataset()
        first = self.get_record(NIP, "Q3-2026")
        first.unit_eselon_ii = "Unit A"
        first.unit_eselon_iii = "Unit A - III"
        first.unit_eselon_iv = "Unit A - IV"
        first.eselon = "III"
        first.npk = Decimal("100")
        first.nhk = Decimal("90")
        first.nkp_awal = Decimal("116")
        first.nkp_akhir = Decimal("115")
        first.nko = Decimal("120")
        first.nkp_perhitungan = kinerja_common._calculate_nkp_perhitungan(
            first.nkp_awal,
            first.nko,
        )
        first.status_nkp_perhitungan = kinerja_common.get_status(first.nkp_perhitungan)
        first.nilai_koreksi = Decimal("0")
        self.session.add_all(
            [
                PerformanceKinerjaRecord(
                    nip="123456789012345679",
                    dataset_id=1,
                    nama="Pegawai A4",
                    unit_eselon_ii="Unit A",
                    unit_eselon_iii="Unit A - IV",
                    unit_eselon_iv="Unit A - IV - IV",
                    eselon="IV",
                    nhk=Decimal("70"),
                    npk=Decimal("80"),
                    nkp_awal=Decimal("114"),
                    nkp_akhir=Decimal("110"),
                    nko=Decimal("100"),
                    nkp_perhitungan=kinerja_common._calculate_nkp_perhitungan(
                        Decimal("114"),
                        Decimal("100"),
                    ),
                    status_nkp_perhitungan="Tinggi",
                    nilai_koreksi=Decimal("-2"),
                ),
                PerformanceKinerjaRecord(
                    nip="123456789012345680",
                    dataset_id=1,
                    nama="Pegawai B3",
                    unit_eselon_ii="Unit B",
                    unit_eselon_iii="Unit B - III",
                    eselon="III",
                    nhk=Decimal("90"),
                    npk=Decimal("110"),
                    nkp_awal=Decimal("120"),
                    nkp_akhir=Decimal("115"),
                    nilai_koreksi=Decimal("3"),
                ),
                PerformanceKinerjaRecord(
                    nip="123456789012345681",
                    dataset_id=1,
                    nama="Pegawai C",
                    unit_eselon_ii="Unit C",
                    eselon="III",
                    nkp_perhitungan=Decimal("115"),
                    status_nkp_perhitungan="Sangat Istimewa",
                    nkp_akhir=Decimal("114"),
                ),
            ]
        )
        self.session.commit()
        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value={}):
            result = kinerja_dashboard.get_dashboard(
                self.session,
                "Unit A",
                ["IV"],
                unit_eselon_iii="Unit A - IV",
                unit_eselon_iv="Unit A - IV - IV",
            )

        self.assertEqual(result["overview"]["employee_count"], 1)
        self.assertEqual(result["unit_eselon_ii_options"], ["Unit A"])
        self.assertEqual(result["unit_eselon_iii_options"], ["Unit A - IV"])
        self.assertEqual(
            result["unit_eselon_iv_options"],
            ["Unit A - IV - IV"],
        )
        self.assertEqual(result["eselon_options"], ["IV"])
        unit_a = next(unit for unit in result["units"] if unit["label"] == "Unit A")
        self.assertEqual(unit_a["employee_count"], 2)
        self.assertEqual(unit_a["average_npk"], 90)
        self.assertEqual(unit_a["nkp_perhitungan_sangat_istimewa_count"], 1)
        self.assertEqual(unit_a["nkp_perhitungan_sangat_istimewa_percentage"], 50)
        self.assertEqual(unit_a["status_gap_count"], 0)
        self.assertEqual(unit_a["correction"]["count"], 1)
        self.assertEqual(unit_a["correction"]["negative_count"], 1)
        self.assertEqual(
            {child["label"] for child in unit_a["children"]},
            {"Unit A - III", "Unit A - IV"},
        )
        unit_a_iii = next(
            child for child in unit_a["children"] if child["label"] == "Unit A - III"
        )
        self.assertEqual(
            [child["label"] for child in unit_a_iii["children"]],
            ["Unit A - IV"],
        )
        unit_a_iv = next(
            child for child in unit_a["children"] if child["label"] == "Unit A - IV"
        )
        self.assertEqual(
            [child["label"] for child in unit_a_iv["children"]],
            ["Unit A - IV - IV"],
        )
        unit_b = next(unit for unit in result["units"] if unit["label"] == "Unit B")
        self.assertEqual(unit_b["status_gap_count"], 1)
        unit_c = next(unit for unit in result["units"] if unit["label"] == "Unit C")
        self.assertEqual(unit_c["status_gap_count"], -1)

    def test_unit_comparison_uses_nkp_perhitungan_status_distribution(self) -> None:
        current = kinerja_dashboard._make_unit_metrics(
            "Unit A",
            [
                PerformanceKinerjaRecord(
                    nip="123456789012345679",
                    dataset_id=1,
                    nama="Current",
                    unit_eselon_ii="Unit A",
                    nkp_awal=Decimal("80"),
                    nkp_perhitungan=Decimal("115"),
                    status_nkp_perhitungan="Sangat Istimewa",
                ),
            ],
        )
        previous = kinerja_dashboard._make_unit_metrics(
            "Unit A",
            [
                PerformanceKinerjaRecord(
                    nip="123456789012345680",
                    dataset_id=2,
                    nama="Previous",
                    unit_eselon_ii="Unit A",
                    nkp_awal=Decimal("120"),
                    nkp_perhitungan=Decimal("114.99"),
                    status_nkp_perhitungan="Istimewa",
                ),
            ],
        )

        comparison = kinerja_dashboard._unit_comparison_values(current, previous)

        very_special = comparison["nkp_perhitungan_status_counts.Sangat Istimewa"]
        special = comparison["nkp_perhitungan_status_counts.Istimewa"]
        self.assertEqual(very_special["delta"], 1)
        self.assertEqual(special["delta"], -1)
        self.assertNotIn("nkp_awal_status_counts.Sangat Istimewa", comparison)

    def test_unit_comparison_includes_correction_percentage(self) -> None:
        current = kinerja_dashboard._make_unit_metrics(
            "Unit A",
            [
                PerformanceKinerjaRecord(
                    nip="123456789012345679",
                    dataset_id=1,
                    nama="Current corrected",
                    unit_eselon_ii="Unit A",
                    nilai_koreksi=Decimal("1"),
                ),
                PerformanceKinerjaRecord(
                    nip="123456789012345680",
                    dataset_id=1,
                    nama="Current unchanged",
                    unit_eselon_ii="Unit A",
                    nilai_koreksi=Decimal("0"),
                ),
            ],
        )
        previous = kinerja_dashboard._make_unit_metrics(
            "Unit A",
            [
                PerformanceKinerjaRecord(
                    nip="123456789012345681",
                    dataset_id=2,
                    nama="Previous corrected",
                    unit_eselon_ii="Unit A",
                    nilai_koreksi=Decimal("-1"),
                ),
                PerformanceKinerjaRecord(
                    nip="123456789012345682",
                    dataset_id=2,
                    nama="Previous unchanged 1",
                    unit_eselon_ii="Unit A",
                    nilai_koreksi=Decimal("0"),
                ),
                PerformanceKinerjaRecord(
                    nip="123456789012345683",
                    dataset_id=2,
                    nama="Previous unchanged 2",
                    unit_eselon_ii="Unit A",
                    nilai_koreksi=Decimal("0"),
                ),
                PerformanceKinerjaRecord(
                    nip="123456789012345684",
                    dataset_id=2,
                    nama="Previous unchanged 3",
                    unit_eselon_ii="Unit A",
                    nilai_koreksi=Decimal("0"),
                ),
            ],
        )

        comparison = kinerja_dashboard._unit_comparison_values(current, previous)

        self.assertEqual(current["correction_percentage"], 50)
        self.assertEqual(previous["correction_percentage"], 25)
        self.assertEqual(comparison["correction_percentage"]["current"], 50)
        self.assertEqual(comparison["correction_percentage"]["previous"], 25)
        self.assertEqual(comparison["correction_percentage"]["delta"], 25)
        self.assertEqual(
            comparison["correction_percentage"]["percentage_change"],
            100,
        )

    def test_get_records_filters_and_sorts_across_the_dataset(self) -> None:
        self.import_active_dataset()
        first = self.get_record(NIP, "Q3-2026")
        first.nama = "Zelda"
        first.unit_eselon_ii = "Unit A"
        first.unit_eselon_iv = "Seksi A"
        first.nhk = Decimal("100")
        self.session.add_all(
            [
                PerformanceKinerjaRecord(
                    nip="123456789012345679",
                    dataset_id=1,
                    nama="Alpha",
                    unit_eselon_ii="Unit A",
                    unit_eselon_iv="Seksi A",
                    nhk=Decimal("110"),
                ),
                PerformanceKinerjaRecord(
                    nip="123456789012345680",
                    dataset_id=1,
                    nama="Beta",
                    unit_eselon_ii="Unit B",
                    unit_eselon_iv="Seksi B",
                    nhk=Decimal("120"),
                ),
            ]
        )
        self.session.commit()
        kinerja_cache.invalidate_dashboard_cache()

        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value={}):
            descending = kinerja_records.get_records(
                self.session,
                page=1,
                page_size=1,
                search="",
                filters={"unit_eselon_ii": "unit a"},
                sort_by="nhk",
                sort_order="desc",
            )
            ascending = kinerja_records.get_records(
                self.session,
                page=1,
                page_size=2,
                search="",
                filters={"unit_eselon_ii": "Unit A"},
                sort_by="nama",
                sort_order="asc",
            )
            filtered_by_unit_iv = kinerja_records.get_records(
                self.session,
                page=1,
                page_size=10,
                search="",
                filters={"unit_eselon_iv": "Seksi A"},
                sort_by="nama",
                sort_order="asc",
            )
            filtered_by_unit_ii = kinerja_records.get_records(
                self.session,
                page=1,
                page_size=10,
                search="",
                filters={"unit_eselon_ii": "Unit A"},
                sort_by="nama",
                sort_order="asc",
            )
            filtered_by_search = kinerja_records.get_records(
                self.session,
                page=1,
                page_size=10,
                search="Zelda",
                filters={},
                sort_by="nama",
                sort_order="asc",
            )

        self.assertEqual(descending["total"], 2)
        self.assertEqual(descending["records"][0]["nip"], "123456789012345679")
        self.assertEqual(
            [record["nama"] for record in ascending["records"]],
            ["Alpha", "Zelda"],
        )
        self.assertEqual(filtered_by_unit_iv["total"], 2)
        self.assertEqual(
            filtered_by_unit_iv["filter_options"]["unit_eselon_iv"],
            ["Seksi A", "Seksi B"],
        )
        self.assertEqual(
            filtered_by_unit_iv["filter_options"]["unit_eselon_ii"],
            ["Unit A"],
        )
        self.assertEqual(
            filtered_by_unit_ii["filter_options"]["unit_eselon_iv"],
            ["Seksi A"],
        )
        self.assertEqual(
            filtered_by_search["filter_options"]["unit_eselon_ii"],
            ["Unit A"],
        )

    def test_dashboard_uses_snapshots_and_refreshes_after_adjustments(self) -> None:
        self.import_active_dataset()
        self.employee_lookup.reset_mock()

        kinerja_dashboard.get_dashboard(self.session, None, [])
        kinerja_dashboard.get_dashboard(self.session, None, ["III"])
        self.employee_lookup.assert_not_called()

        with patch.object(
            kinerja_corrections,
            "fetch_submitted_correction_rows",
            return_value=[
                {
                    "form_id": 25,
                    "id_unit": "1234567890123",
                    "nip": NIP,
                    "nilai_koreksi": "-3",
                }
            ],
        ):
            kinerja_corrections.sync_adjustments_from_epride(
                self.session,
                "Q3-2026",
                2026,
                2,
                {},
            )
        kinerja_dashboard.get_dashboard(self.session, None, [])
        self.employee_lookup.assert_not_called()

    def test_excel_exports_include_unit_children_and_search_all_matching_records(self) -> None:
        second_nip = "123456789012345679"
        content = full_csv() + full_csv(nip=second_nip).split(b"\n", 1)[1]
        employees = {
            NIP: {
                "unit_eselon_ii": "Unit A",
                "unit_eselon_iii": "Subunit A",
                "unit_eselon_iv": "Seksi A",
                "eselon": "III",
            },
            second_nip: {
                "unit_eselon_ii": "Unit A",
                "unit_eselon_iii": "Subunit A",
                "unit_eselon_iv": "Seksi A",
                "eselon": "III",
            },
        }
        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value=employees):
            kinerja_uploads.replace_full_upload(
                self.session,
                content,
                "Q3-2026",
                uploaded_by_user="admin",
                uploaded_by_name="Admin",
            )
            unit_workbook = load_workbook(
                BytesIO(kinerja_exports.create_unit_analysis_workbook(self.session)),
                data_only=True,
            )
            records_workbook = load_workbook(
                BytesIO(kinerja_exports.create_performance_records_workbook(self.session)),
                data_only=True,
            )
            filtered_workbook = load_workbook(
                BytesIO(
                    kinerja_exports.create_performance_records_workbook(
                        self.session,
                        search=second_nip[-6:],
                    )
                ),
                data_only=True,
            )

        unit_sheet = unit_workbook["Unit Eselon II"]
        record_sheet = records_workbook["Daftar Pegawai"]
        filtered_sheet = filtered_workbook["Daftar Pegawai"]
        record_headers = [cell.value for cell in record_sheet[1]]
        self.assertEqual(unit_sheet.max_row, 4)
        self.assertEqual(unit_sheet["H1"].value, "NKP Perhitungan Sangat Istimewa")
        self.assertEqual(unit_sheet["V1"].value, "Gap Status")
        self.assertEqual(unit_sheet["A2"].value, "Unit A")
        self.assertEqual(unit_sheet["V2"].value, 0)
        self.assertEqual(unit_sheet["A3"].value, "Unit A")
        self.assertEqual(unit_sheet["B3"].value, "Subunit A")
        self.assertEqual(unit_sheet["C4"].value, "Seksi A")
        self.assertEqual(record_sheet.max_row, 3)
        self.assertEqual(record_sheet["B2"].value, NIP)
        self.assertEqual(record_sheet["B2"].number_format, "@")
        self.assertEqual(record_sheet["E2"].value, "Seksi A")
        self.assertIn("NKP Perhitungan", record_headers)
        self.assertIn("Status NKP Perhitungan", record_headers)
        self.assertEqual(record_sheet["B3"].value, second_nip)
        self.assertEqual(filtered_sheet.max_row, 2)
        self.assertEqual(filtered_sheet["B2"].value, second_nip)
        unit_workbook.close()
        records_workbook.close()
        filtered_workbook.close()

    def test_get_records_returns_paginated_rows_and_unidentified_group(self) -> None:
        kinerja_uploads.replace_full_upload(
            self.session,
            full_csv(nip="1234567890123456"),
            "Q3-2026",
            uploaded_by_user="admin",
            uploaded_by_name="Admin",
        )
        with patch.object(kinerja_uploads, "_lookup_employee_records", return_value={}):
            result = kinerja_records.get_records(self.session, page=1, page_size=1, search="Pegawai")
        self.assertEqual(result["total"], 1)
        self.assertEqual(len(result["records"]), 1)
        self.assertEqual(result["records"][0]["unit_eselon_ii"], "Unidentified")
        self.assertEqual(result["records"][0]["eselon"], "Unidentified")
        self.assertEqual(result["records"][0]["status"], "Rendah")
        self.assertEqual(result["records"][0]["nkp_perhitungan"], 85.5)
        self.assertEqual(result["records"][0]["status_nkp_perhitungan"], "Rendah")


class PerformanceKinerjaAuthorizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.menu_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.menu_engine,
            tables=[MenuAccessPolicy.__table__],
        )

        def override_history_db():
            with Session(self.menu_engine) as session:
                yield session

        app.dependency_overrides[get_history_db] = override_history_db
        app.dependency_overrides[get_optional_current_user] = self.get_optional_user

    def get_optional_user(self):
        user_override = app.dependency_overrides.get(get_current_user)
        if user_override is not None:
            return user_override()
        super_admin_override = app.dependency_overrides.get(get_super_admin)
        return super_admin_override() if super_admin_override is not None else None

    def tearDown(self) -> None:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_optional_current_user, None)
        app.dependency_overrides.pop(get_history_db, None)
        self.menu_engine.dispose()

    def test_normal_admin_cannot_upload_performance_data(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="admin",
            name="Admin",
            auth_level=2,
        )
        try:
            client = TestClient(app)
            response = client.post(
                "/performance/full-data/validate",
                data={"period": "Q3-2026"},
                files={"file": ("data.csv", full_csv(), "text/csv")},
            )
            sync_response = client.post(
                "/performance/adjustments/sync",
                params={"period": "Q3-2026", "source_year": 2026, "source_tw": 2},
                json={},
            )
            check_response = client.post(
                "/performance/adjustments/check",
                params={"period": "Q3-2026", "source_year": 2026, "source_tw": 2},
            )
            source_periods_response = client.get("/performance/adjustments/source-periods")
            delete_response = client.delete("/performance/datasets/Q3-2026")
        finally:
            app.dependency_overrides.pop(get_current_user, None)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(sync_response.status_code, 403)
        self.assertEqual(check_response.status_code, 403)
        self.assertEqual(source_periods_response.status_code, 403)
        self.assertEqual(delete_response.status_code, 403)

    def test_regular_user_cannot_edit_corrections_or_read_the_edit_log(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="viewer",
            name="Viewer",
            auth_level=1,
        )
        try:
            client = TestClient(app)
            edit_response = client.post(
                "/performance/corrections/manual",
                json={
                    "period": "Q3-2026",
                    "nip": NIP,
                    "nilai_koreksi": 1.5,
                },
            )
            log_response = client.get("/performance/corrections/edit-log")
            undo_response = client.post(
                "/performance/corrections/edit-log/1/undo",
            )
            template_response = client.get(
                "/performance/corrections/batch-template",
            )
            batch_response = client.post(
                "/performance/corrections/batch",
                data={"period": "Q3-2026"},
                files={
                    "file": (
                        "batch.xlsx",
                        correction_batch_xlsx([(NIP, "2")]),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(edit_response.status_code, 403)
        self.assertEqual(log_response.status_code, 403)
        self.assertEqual(undo_response.status_code, 403)
        self.assertEqual(template_response.status_code, 403)
        self.assertEqual(batch_response.status_code, 403)

    def test_admin_can_edit_list_and_undo_corrections_via_api(self) -> None:
        test_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            test_engine,
            tables=[
                MenuAccessPolicy.__table__,
                PerformanceKinerjaDataset.__table__,
                PerformanceKinerjaRecord.__table__,
                PerformanceCorrectionEditLog.__table__,
            ],
        )
        with Session(test_engine) as session:
            dataset = PerformanceKinerjaDataset(
                period="Q3-2026",
                row_count=1,
                uploaded_by_user="superadmin",
                uploaded_by_name="Super Admin",
            )
            session.add(dataset)
            session.flush()
            session.add(
                PerformanceKinerjaRecord(
                    dataset_id=dataset.id,
                    nip=NIP,
                    nama="Pegawai Contoh",
                    nkp_awal=Decimal("85"),
                    nilai_hukuman_disiplin=Decimal("-1"),
                    nilai_dampak_pelanggaran_disiplin=Decimal("-2"),
                    nilai_koreksi=Decimal("1"),
                    nko=Decimal("90"),
                    nkp_akhir=Decimal("83.5"),
                )
            )
            session.commit()

        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="admin",
            name="Admin User",
            auth_level=2,
        )

        def override_history_db():
            with Session(test_engine) as session:
                yield session

        app.dependency_overrides[get_history_db] = override_history_db
        try:
            client = TestClient(app)
            edit_response = client.post(
                "/performance/corrections/manual",
                json={
                    "period": "Q3-2026",
                    "nip": NIP,
                    "nilai_koreksi": 2.5,
                },
            )
            log_response = client.get("/performance/corrections/edit-log")
            undo_response = client.post("/performance/corrections/edit-log/1/undo")
            template_response = client.get("/performance/corrections/batch-template")
            batch_response = client.post(
                "/performance/corrections/batch",
                data={"period": "Q3-2026"},
                files={
                    "file": (
                        "batch.xlsx",
                        correction_batch_xlsx([(NIP, "2.75")]),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_history_db, None)
            test_engine.dispose()

        self.assertEqual(edit_response.status_code, 200)
        self.assertEqual(edit_response.json()["nilai_koreksi"], 2.5)
        self.assertTrue(edit_response.json()["changed"])
        self.assertEqual(log_response.status_code, 200)
        self.assertEqual(log_response.json()["total"], 1)
        self.assertEqual(log_response.json()["records"][0]["edited_by_user"], "admin")
        self.assertEqual(undo_response.status_code, 200)
        self.assertEqual(undo_response.json()["nilai_koreksi"], 1.0)
        self.assertEqual(template_response.status_code, 200)
        self.assertIn(
            "spreadsheetml.sheet",
            template_response.headers["content-type"],
        )
        self.assertEqual(batch_response.status_code, 200)
        self.assertEqual(batch_response.json()["updated_count"], 1)
        self.assertEqual(batch_response.json()["unchanged_count"], 0)

    def test_super_admin_can_check_and_sync_performance_corrections(self) -> None:
        app.dependency_overrides[get_super_admin] = lambda: SimpleNamespace(
            user="superadmin",
            name="Super Admin",
            auth_level=3,
        )

        preview = {
            "period": "Q3-2026",
            "source_year": 2026,
            "source_tw": 2,
            "row_count": 10,
            "source_row_count": 5,
            "source_nip_count": 5,
            "matched_count": 5,
            "unmatched_count": 5,
            "duplicate_nip_group_count": 0,
            "ignored_unit_row_count": 2,
            "source_only_nip_count": 0,
            "conflicts": [],
        }
        result = {**preview, "resolved_conflict_count": 0}
        try:
            with (
                patch.object(kinerja_corrections, "get_available_epride_source_periods", return_value=[
                    {"year": 2026, "available_tw": [2]},
                ]),
                patch.object(kinerja_corrections, "check_adjustments_from_epride", return_value=preview),
                patch.object(kinerja_corrections, "sync_adjustments_from_epride", return_value=result),
            ):
                client = TestClient(app)
                source_periods_response = client.get("/performance/adjustments/source-periods")
                check_response = client.post(
                    "/performance/adjustments/check",
                    params={"period": "Q3-2026", "source_year": 2026, "source_tw": 2},
                )
                sync_response = client.post(
                    "/performance/adjustments/sync",
                    params={"period": "Q3-2026", "source_year": 2026, "source_tw": 2},
                    json={"conflict_resolutions": {}},
                )
        finally:
            app.dependency_overrides.pop(get_super_admin, None)
            app.dependency_overrides.pop(get_history_db, None)

        self.assertEqual(check_response.status_code, 200)
        self.assertEqual(sync_response.status_code, 200)
        self.assertEqual(source_periods_response.status_code, 200)
        self.assertEqual(source_periods_response.json(), [{"year": 2026, "available_tw": [2]}])
        self.assertEqual(check_response.json(), preview)
        self.assertEqual(sync_response.json(), result)

    def test_super_admin_can_delete_dataset_period_and_its_correction_logs(self) -> None:
        test_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            test_engine,
            tables=[
                MenuAccessPolicy.__table__,
                PerformanceKinerjaDataset.__table__,
                PerformanceKinerjaRecord.__table__,
                PerformanceCorrectionEditLog.__table__,
            ],
        )
        with Session(test_engine) as session:
            dataset = PerformanceKinerjaDataset(
                period="Q3-2026",
                row_count=1,
                uploaded_by_user="superadmin",
                uploaded_by_name="Super Admin",
            )
            session.add(dataset)
            session.flush()
            session.add(
                PerformanceKinerjaRecord(
                    dataset_id=dataset.id,
                    nip=NIP,
                    nama="Pegawai Contoh",
                    nilai_koreksi=Decimal("2"),
                )
            )
            session.add(
                PerformanceCorrectionEditLog(
                    period="Q3-2026",
                    nip=NIP,
                    employee_name="Pegawai Contoh",
                    old_value=Decimal("1"),
                    new_value=Decimal("2"),
                    edited_by_user="admin",
                    edited_by_name="Admin",
                )
            )
            session.commit()

        app.dependency_overrides[get_super_admin] = lambda: SimpleNamespace(
            user="superadmin",
            name="Super Admin",
            auth_level=3,
        )

        def override_history_db():
            with Session(test_engine) as session:
                yield session

        app.dependency_overrides[get_history_db] = override_history_db
        try:
            client = TestClient(app)
            response = client.delete("/performance/datasets/Q3-2026")
            dashboard_response = client.get("/performance/dashboard")
            missing_response = client.delete("/performance/datasets/Q3-2026")
            invalid_period_response = client.delete("/performance/datasets/2026-Q3")
        finally:
            app.dependency_overrides.pop(get_super_admin, None)
            app.dependency_overrides.pop(get_history_db, None)

        with Session(test_engine) as session:
            self.assertIsNone(
                session.scalar(
                    select(PerformanceKinerjaDataset).where(
                        PerformanceKinerjaDataset.period == "Q3-2026"
                    )
                )
            )
            self.assertEqual(
                session.scalars(select(PerformanceKinerjaRecord)).all(),
                [],
            )
            self.assertEqual(
                session.scalars(select(PerformanceCorrectionEditLog)).all(),
                [],
            )
        test_engine.dispose()

        self.assertEqual(response.status_code, 204)
        self.assertEqual(dashboard_response.status_code, 200)
        self.assertIsNone(dashboard_response.json()["dataset"])
        self.assertEqual(missing_response.status_code, 404)
        self.assertEqual(invalid_period_response.status_code, 422)

    def test_guest_can_read_empty_analysis_and_records(self) -> None:
        test_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            test_engine,
            tables=[
                MenuAccessPolicy.__table__,
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
                MenuAccessPolicy.__table__,
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
                MenuAccessPolicy.__table__,
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
            with patch.object(kinerja_uploads, "_lookup_employee_records", return_value={}):
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
                MenuAccessPolicy.__table__,
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
            with patch.object(kinerja_uploads, "_lookup_employee_records", return_value={}):
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
            with patch.object(
                kinerja_uploads,
                "_lookup_employee_records",
                return_value=EMPLOYEE,
            ) as employee_lookup:
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
        employee_lookup.assert_called_once_with(
            {NIP},
            employee_source="fetch_pbnopen",
        )

    def test_super_admin_can_validate_full_data_with_q2_reference_source(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            user="root",
            name="Root",
            auth_level=3,
        )
        try:
            with patch.object(
                kinerja_uploads,
                "_lookup_employee_records",
                return_value=EMPLOYEE,
            ) as employee_lookup:
                response = TestClient(app).post(
                    "/performance/full-data/validate",
                    data={
                        "period": "Q2-2026",
                        "employee_source": "dt_employee_q2_2026",
                    },
                    files={"file": ("data.csv", full_csv(), "text/csv")},
                )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        self.assertEqual(response.status_code, 200)
        employee_lookup.assert_called_once_with(
            {NIP},
            employee_source="dt_employee_q2_2026",
        )


if __name__ == "__main__":
    unittest.main()
