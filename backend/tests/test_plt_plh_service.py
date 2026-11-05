import unittest
from datetime import date, datetime
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch

from openpyxl import load_workbook

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
        self.assertEqual([row[0] for row in rows[1:]], [1, 2])


if __name__ == "__main__":
    unittest.main()
