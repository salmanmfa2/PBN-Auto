import unittest
from datetime import date
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch
from zipfile import ZipFile

from lxml import etree
from openpyxl import Workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.history_db import Base
from app.models.auth import User
from app.models.pelantikan_agenda import PelantikanAgenda, PelantikanAgendaPerson
from app.schemas.pelantikan_agenda import PelantikanAgendaPersonRead, PelantikanPersonChoice
from app.services import pelantikan_agenda_service as service


class PelantikanAgendaServiceTests(unittest.TestCase):
    def test_normalize_nip_accepts_only_eighteen_digits(self):
        self.assertEqual(service.normalize_nip(123456789012345678), "123456789012345678")
        self.assertEqual(service.normalize_nip("1234 5678 9012 3456 78"), "123456789012345678")
        self.assertIsNone(service.normalize_nip("12345678901234567"))
        self.assertIsNone(service.normalize_nip(float("nan")))

    def test_formal_recipient_names_are_derived_from_known_unit_prefixes(self):
        self.assertEqual(
            service._format_formal_recipient("Kanwil DJPb Prov. Kalimantan Tengah"),
            "Kepala Kantor Wilayah Direktorat Jenderal Perbendaharaan Provinsi Kalimantan Tengah",
        )
        self.assertEqual(
            service._format_formal_recipient("Direktorat Jenderal Perbendaharaan"),
            "Direktur Jenderal Perbendaharaan",
        )
        self.assertEqual(
            service._format_formal_recipient("Badan Kebijakan Fiskal"),
            "Kepala Badan Kebijakan Fiskal",
        )
        self.assertEqual(service._format_formal_recipient("Unit Lain"), "Unit Lain")

    def test_roster_job_adds_formal_unit_only_for_known_non_eselon_two(self):
        self.assertEqual(
            service._format_job_with_unit(
                SimpleNamespace(
                    jabatan="Kepala Bagian Umum",
                    unit_eselon_ii="Kanwil DJPb Prov. Banteng",
                    eselon="III",
                )
            ),
            "Kepala Bagian Umum Kantor Wilayah Direktorat Jenderal Perbendaharaan Provinsi Banteng",
        )
        self.assertEqual(
            service._format_job_with_unit(
                SimpleNamespace(
                    jabatan="Kepala Kantor Wilayah",
                    unit_eselon_ii="Kanwil DJPb Prov. Banteng",
                    eselon="2",
                )
            ),
            "Kepala Kantor Wilayah",
        )
        self.assertEqual(
            service._format_job_with_unit(
                SimpleNamespace(
                    jabatan="Kepala Bagian Umum",
                    unit_eselon_ii="Kanwil DJPb Prov. Banteng",
                    eselon=None,
                )
            ),
            "Kepala Bagian Umum",
        )

    def test_pendamping_cannot_be_saved_as_selected(self):
        person = SimpleNamespace(
            id=1,
            row_number=8,
            source_no="Pendamping",
            lookup_status="matched",
            unit_eselon_ii="Unit A",
            selected=False,
            modality=None,
        )
        agenda = SimpleNamespace(people=[person], status="draft")

        with self.assertRaisesRegex(ValueError, "Pendamping"):
            service.save_person_choices(
                SimpleNamespace(),
                agenda,
                [PelantikanPersonChoice(id=1, selected=True, modality="daring")],
            )

    def test_document_token_replacement_preserves_official_tokens_and_literal_values(self):
        xml = f"""<?xml version="1.0"?>
        <w:document xmlns:w="{service.W_NS}">
          <w:body><w:p><w:r><w:t>(nomor_</w:t></w:r>
          <w:r><w:t>nd)</w:t></w:r><w:r><w:t> [@NomorND]</w:t></w:r></w:p></w:body>
        </w:document>""".encode()

        updated = service._replace_document_tokens(
            xml,
            {"(nomor_nd)": "Nomor (tanggal_nd)", "(tanggal_nd)": "Tanggal"},
        )
        root = etree.fromstring(updated)
        paragraph_text = "".join(root.xpath(".//w:t/text()", namespaces={"w": service.W_NS}))

        self.assertIn("Nomor (tanggal_nd)", paragraph_text)
        self.assertIn("[@NomorND]", paragraph_text)

    def test_templates_grow_roster_and_keep_official_placeholders(self):
        agenda = SimpleNamespace(
            tanggal_pelantikan=date(2026, 9, 20),
            tanggal_nd_undangan_pelantikan=date(2026, 9, 1),
            nd_undangan_pelantikan="ND-001",
            jam_pelantikan="09:00",
            dresscode="Pakaian dinas",
            level_jabatan="Administrator",
        )
        people = [
            SimpleNamespace(
                nama=f"Nama {index}",
                nip=f"1234567890123456{index:02d}",
                jabatan=f"Jabatan {index}",
                unit_eselon_ii="",
                eselon=None,
            )
            for index in range(10)
        ]

        for modality in ("daring", "luring"):
            document = service.build_agenda_docx(
                agenda,
                people,
                modality,
                "Kanwil DJPb Prov. Kalimantan Tengah",
            )
            with ZipFile(BytesIO(document)) as archive:
                root = etree.fromstring(archive.read("word/document.xml"))

            text = "".join(root.xpath(".//w:t/text()", namespaces={"w": service.W_NS}))
            roster = service._find_roster_table(root)
            rows = roster.findall("./w:tr", service.NS)
            self.assertEqual(len(rows), 11)
            self.assertIn("Nama 9", text)
            self.assertIn(
                "Kepala Kantor Wilayah Direktorat Jenderal Perbendaharaan Provinsi Kalimantan Tengah",
                text,
            )
            self.assertIn("ND-001", text)
            self.assertIn("[@NomorND]", text)
            self.assertIn("[@TanggalND]", text)

    def test_generation_groups_by_unit_and_modality(self):
        agenda = SimpleNamespace(
            people=[
                SimpleNamespace(
                    row_number=1,
                    selected=True,
                    lookup_status="matched",
                    modality="daring",
                    unit_eselon_ii="Unit A",
                ),
                SimpleNamespace(
                    row_number=2,
                    selected=True,
                    lookup_status="matched",
                    modality="luring",
                    unit_eselon_ii="Unit A",
                ),
                SimpleNamespace(
                    row_number=3,
                    selected=True,
                    lookup_status="matched",
                    modality="daring",
                    unit_eselon_ii="Unit B",
                ),
                SimpleNamespace(
                    row_number=4,
                    selected=True,
                    lookup_status="matched",
                    modality="luring",
                    unit_eselon_ii="Unit C",
                    source_no="Pendamping",
                ),
            ],
            last_generated_at=None,
            status="ready",
        )
        db = SimpleNamespace(commit=lambda: None)

        with patch.object(service, "build_agenda_docx", return_value=b"docx"):
            data, group_count = service.generate_agenda_zip(db, agenda)

        with ZipFile(BytesIO(data)) as archive:
            filenames = archive.namelist()
        self.assertEqual(group_count, 3)
        self.assertEqual(len(filenames), 3)
        self.assertTrue(any("unit_a_daring.docx" in name for name in filenames))
        self.assertTrue(any("unit_a_luring.docx" in name for name in filenames))
        self.assertTrue(any("unit_b_daring.docx" in name for name in filenames))
        self.assertFalse(any("unit_c_luring.docx" in name for name in filenames))

    def test_choices_persist_and_agenda_is_scoped_to_creator(self):
        test_engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(test_engine)
        try:
            with Session(test_engine) as db:
                db.add(User(user="alice", name="Alice", password="test"))
                agenda = PelantikanAgenda(
                    id="agenda-1",
                    created_by="alice",
                    tanggal_pelantikan=date(2026, 9, 20),
                    nd_undangan_pelantikan="ND-001",
                    tanggal_nd_undangan_pelantikan=date(2026, 9, 1),
                    jam_pelantikan="09:00",
                    dresscode="Pakaian dinas",
                    level_jabatan="Administrator",
                )
                agenda.people.extend([
                    PelantikanAgendaPerson(
                        row_number=1,
                        nip="123456789012345678",
                        nama="Nama",
                        jabatan="Jabatan",
                        unit_eselon_ii="Unit A",
                        lookup_status="matched",
                    ),
                    PelantikanAgendaPerson(
                        row_number=2,
                        nip=None,
                        nama="",
                        jabatan="",
                        unit_eselon_ii="",
                        lookup_status="missing_nip",
                    ),
                ])
                db.add(agenda)
                db.commit()
                loaded = service.get_owned_agenda(db, agenda.id, "alice")
                person_ids = [person.id for person in loaded.people]

                with self.assertRaises(KeyError):
                    service.get_owned_agenda(db, agenda.id, "bob")

                updated = service.save_person_choices(
                    db,
                    loaded,
                    [
                        PelantikanPersonChoice(id=person_ids[0], selected=True, modality="luring"),
                        PelantikanPersonChoice(id=person_ids[1], selected=False),
                    ],
                )
                self.assertEqual(updated.status, "ready")
                self.assertTrue(updated.people[0].selected)
                self.assertEqual(updated.people[0].modality, "luring")
                self.assertFalse(updated.people[1].selected)
        finally:
            Base.metadata.drop_all(test_engine)
            test_engine.dispose()

    def test_upload_uses_third_row_header_filters_blank_nama_nip_and_keeps_source_columns(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(["Judul dokumen"])
        worksheet.append([])
        worksheet.append([
            "NO.",
            "Nama/NIP",
            "Tanggal lahir",
            "Jabatan Saat ini/Grade",
            "Usul Jabatan Baru/Grade",
            "Kolom yang tidak dipakai",
        ])
        worksheet.append([None, None, None, "Baris tanpa nama/NIP", "Baris tanpa nama/NIP", None])
        worksheet.append([
            1,
            "Nama Excel, S.E., MBus Process Mgt.\n123456789012345678  ",
            None,
            "Jabatan lama",
            "Jabatan usulan",
            "abaikan",
        ])
        roster_worksheet = workbook.create_sheet("Roster")
        roster_worksheet.append(["Daftar pegawai"])
        roster_worksheet.append([])
        roster_worksheet.append([
            "NO.",
            "Nama/NIP",
            "Tanggal lahir",
            "Jabatan Saat ini/Grade",
            "Usul Jabatan Baru/Grade",
            "Kolom yang tidak dipakai",
        ])
        roster_worksheet.append([
            None,
            None,
            None,
            "Baris tanpa nama/NIP",
            "Baris tanpa nama/NIP",
            None,
        ])
        roster_worksheet.append([
            2,
            "Nama Pilihan, S.E.\n234567890123456789",
            None,
            "Jabatan kedua",
            "Usul jabatan kedua",
            None,
        ])
        workbook_data = BytesIO()
        workbook.save(workbook_data)
        self.assertEqual(
            service.list_workbook_sheets(workbook_data.getvalue(), "pegawai.xlsx"),
            ["Sheet", "Roster"],
        )

        test_engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(test_engine)
        try:
            with Session(test_engine) as db:
                db.add(User(user="alice", name="Alice", password="test"))
                agenda = PelantikanAgenda(
                    id="agenda-upload",
                    created_by="alice",
                    tanggal_pelantikan=date(2026, 9, 20),
                    nd_undangan_pelantikan="ND-001",
                    tanggal_nd_undangan_pelantikan=date(2026, 9, 1),
                    jam_pelantikan="09:00",
                    dresscode="Pakaian dinas",
                    level_jabatan="Administrator",
                )
                db.add(agenda)
                db.commit()
                with (
                    patch.object(
                        service,
                        "_lookup_employee_records",
                        return_value={
                            "123456789012345678": {
                                "nama": "Nama Database",
                                "jabatan": "Jabatan Database",
                                "unit_eselon_ii": "Unit A",
                                "eselon": "III",
                            }
                        },
                    ),
                ):
                    updated = service.upload_and_match(
                        db,
                        agenda,
                        workbook_data.getvalue(),
                        "pegawai.xlsx",
                    )

                self.assertEqual(len(updated.people), 1)
                self.assertEqual(updated.people[0].lookup_status, "matched")
                self.assertEqual(updated.people[0].nama, "Nama Database")
                self.assertEqual(updated.people[0].nip, "123456789012345678")
                self.assertEqual(updated.people[0].eselon, "III")
                self.assertEqual(updated.people[0].row_number, 5)
                self.assertEqual(updated.people[0].source_no, "1")
                self.assertEqual(
                    updated.people[0].source_nama_nip,
                    "Nama Excel, S.E., MBus Process Mgt.\n123456789012345678",
                )
                self.assertEqual(updated.people[0].source_jabatan_saat_ini, "Jabatan lama")
                self.assertEqual(updated.people[0].source_usul_jabatan_baru, "Jabatan usulan")
                person_read = PelantikanAgendaPersonRead.model_validate(updated.people[0])
                self.assertEqual(
                    person_read.source_nama_nip,
                    "Nama Excel, S.E., MBus Process Mgt.\n123456789012345678",
                )
                with patch.object(service, "_lookup_employee_records", return_value={}):
                    selected_sheet_agenda = service.upload_and_match(
                        db,
                        agenda,
                        workbook_data.getvalue(),
                        "pegawai.xlsx",
                        "Roster",
                    )

                self.assertEqual(selected_sheet_agenda.uploaded_sheet, "Roster")
                self.assertEqual(len(selected_sheet_agenda.people), 1)
                self.assertEqual(selected_sheet_agenda.people[0].source_no, "2")
                self.assertEqual(selected_sheet_agenda.people[0].row_number, 5)
                self.assertEqual(
                    selected_sheet_agenda.people[0].nip,
                    "234567890123456789",
                )
        finally:
            Base.metadata.drop_all(test_engine)
            test_engine.dispose()


if __name__ == "__main__":
    unittest.main()
