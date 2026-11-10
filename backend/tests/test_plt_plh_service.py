import unittest
from datetime import date, datetime
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from openpyxl import load_workbook

from app.schemas.plt_plh import PltPlhRecordFields
from app.services import plt_plh_service
from app.services.plt_plh_service import _completed_months, export_records, record_to_read


class PltPlhServiceTests(unittest.TestCase):
    def test_completed_months_counts_only_full_months(self):
        self.assertEqual(_completed_months(date(2026, 1, 4), date(2026, 6, 4)), 5)
        self.assertEqual(_completed_months(date(2026, 1, 5), date(2026, 6, 4)), 4)

    def test_record_status_transitions_at_five_and_six_months(self):
        base_record = {
            "id": 1,
            "jabatan_kosong": "Jabatan",
            "pejabat_pengganti": "Nama",
            "pejabat_pengganti_nip": None,
            "jabatan_definitif_pengganti": "Jabatan definitif",
            "nomor_surat": "Nomor surat",
            "tmt": date(2026, 1, 4),
            "is_active": True,
            "created_at": datetime(2026, 1, 4),
            "updated_at": datetime(2026, 1, 4),
        }

        five_months = record_to_read(SimpleNamespace(**base_record), date(2026, 6, 4))
        six_months = record_to_read(SimpleNamespace(**base_record), date(2026, 7, 4))

        self.assertEqual(five_months.status, "Mendekati 6 Bulan")
        self.assertEqual(five_months.masa_kerja, "0 Y 5 M")
        self.assertEqual(six_months.status, "Lebih dari 6 Bulan")

    def test_deactivated_record_is_inactive_regardless_of_tenure(self):
        record = SimpleNamespace(
            id=1,
            jabatan_kosong="Jabatan",
            pejabat_pengganti="Nama",
            pejabat_pengganti_nip=None,
            jabatan_definitif_pengganti="Jabatan definitif",
            nomor_surat="Nomor surat",
            tmt=date(2025, 1, 4),
            is_active=False,
            created_at=datetime(2025, 1, 4),
            updated_at=datetime(2025, 1, 4),
        )

        result = record_to_read(record, date(2026, 7, 4))

        self.assertEqual(result.status, "Inaktif")
        self.assertEqual(result.masa_kerja, "1 Y 6 M")

    def test_export_uses_contiguous_row_numbers_instead_of_database_ids(self):
        records = [
            SimpleNamespace(
                id=7,
                jabatan_kosong="Jabatan 1",
                pejabat_pengganti="Nama 1",
                pejabat_pengganti_nip="197906262000121001",
                jabatan_definitif_pengganti="Jabatan definitif 1",
                nomor_surat="Surat 1",
                tmt=date(2026, 1, 1),
                masa_kerja="0 Y 10 M",
                status="Lebih dari 6 Bulan",
            ),
            SimpleNamespace(
                id=11,
                jabatan_kosong="Jabatan 2",
                pejabat_pengganti="Nama 2",
                pejabat_pengganti_nip="197906262000121002",
                jabatan_definitif_pengganti="Jabatan definitif 2",
                nomor_surat="Surat 2",
                tmt=date(2026, 2, 1),
                masa_kerja="0 Y 9 M",
                status="Lebih dari 6 Bulan",
            ),
        ]

        with patch("app.services.plt_plh_service.list_records", return_value=records):
            workbook_data = export_records(None)

        workbook = load_workbook(BytesIO(workbook_data.getvalue()), read_only=True)
        worksheet = workbook.active
        rows = list(worksheet.iter_rows(values_only=True))

        self.assertEqual(rows[0][0], "No.")
        self.assertEqual(rows[0][3], "NIP Pejabat Pengganti")
        self.assertEqual([row[0] for row in rows[1:]], [1, 2])

    def test_search_pbn_open_employees_formats_job_and_unit_for_selection(self):
        connection = MagicMock()
        connection.execute.return_value.mappings.return_value.all.return_value = [
            {
                "nip": "197906262000121002",
                "nama": "Teddy Imam Saputro",
                "jabatan": "Kepala Bagian Umum",
                "unit_eselon_ii": "Kanwil DJPb Prov. Banteng",
                "eselon": "III",
            },
            {
                "nip": "197906262000121003",
                "nama": "Sari Wulandari",
                "jabatan": "Kepala Kantor Wilayah",
                "unit_eselon_ii": "Kanwil DJPb Prov. Banteng",
                "eselon": "II",
            },
        ]

        with patch.object(plt_plh_service.engine, "connect") as connect:
            connect.return_value.__enter__.return_value = connection
            employees = plt_plh_service.search_pbn_open_employees("Teddy")

        self.assertEqual(
            [employee.jabatan_definitif_pengganti for employee in employees],
            [
                "Kepala Bagian Umum Kantor Wilayah Direktorat Jenderal "
                "Perbendaharaan Provinsi Banteng",
                "Kepala Kantor Wilayah",
            ],
        )
        self.assertEqual(employees[0].nip, "197906262000121002")

    def test_search_pbn_open_employees_skips_database_for_short_query(self):
        with patch.object(plt_plh_service.engine, "connect") as connect:
            self.assertEqual(plt_plh_service.search_pbn_open_employees("A"), [])
        connect.assert_not_called()

    def test_plt_plh_fields_normalize_selected_employee_nip(self):
        fields = PltPlhRecordFields(
            jabatan_kosong="Jabatan kosong",
            pejabat_pengganti="Nama",
            pejabat_pengganti_nip="1979 0626 2000 1210 02",
            jabatan_definitif_pengganti="Jabatan definitif",
            nomor_surat="Surat",
            tmt=date(2026, 1, 1),
        )

        self.assertEqual(fields.pejabat_pengganti_nip, "197906262000121002")


if __name__ == "__main__":
    unittest.main()
