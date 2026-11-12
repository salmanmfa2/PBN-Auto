import unittest
from datetime import date
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from zipfile import ZipFile

from lxml import etree
from openpyxl import Workbook, load_workbook
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

    def test_people_to_read_includes_unit_city_from_reference_table(self):
        person = SimpleNamespace(
            id=1,
            row_number=1,
            source_no=None,
            source_sheet=None,
            source_row_number=None,
            source_nama_nip=None,
            source_jabatan_saat_ini=None,
            source_usul_jabatan_baru=None,
            nip="123456789012345678",
            nama="Nama",
            jabatan="Jabatan",
            unit_eselon_ii="Unit A",
            eselon="III",
            lookup_status="matched",
            selected=False,
            modality=None,
        )
        connection = MagicMock()
        connection.execute.return_value.mappings.return_value = [
            {"unit_kerja_id": 12, "value": "Unit A", "city": "Jakarta"},
        ]

        with patch.object(service.engine, "connect") as connect:
            connect.return_value.__enter__.return_value = connection
            people = service.people_to_read([person])

        self.assertEqual(people[0]["unit_city"], "Jakarta")
        self.assertEqual(people[0]["unit_kerja_id"], 12)

    def test_appendix_docx_sorts_luring_first_then_by_unit_reference_id(self):
        people = [
            SimpleNamespace(
                row_number=1,
                selected=True,
                source_no="1",
                nip="123456789012345671",
                nama="Daring Unit A",
                jabatan="Jabatan Daring A",
                unit_eselon_ii="Unit A",
                lookup_status="matched",
                modality="daring",
            ),
            SimpleNamespace(
                row_number=2,
                selected=True,
                source_no="2",
                nip="123456789012345672",
                nama="Luring Unit C",
                jabatan="Jabatan Luring C",
                unit_eselon_ii="Unit C",
                lookup_status="matched",
                modality="luring",
            ),
            SimpleNamespace(
                row_number=3,
                selected=True,
                source_no="3",
                nip="123456789012345673",
                nama="Luring Unit B",
                jabatan="Jabatan Luring B",
                unit_eselon_ii="Unit B",
                lookup_status="matched",
                modality="luring",
            ),
            SimpleNamespace(
                row_number=4,
                selected=True,
                source_no="4",
                nip="123456789012345674",
                nama="Luring Unit A",
                jabatan="Jabatan Luring A",
                unit_eselon_ii="Unit A",
                lookup_status="matched",
                modality="luring",
            ),
        ]
        agenda = SimpleNamespace(people=people)
        unit_references = {
            "unit a": (10, ""),
            "unit b": (20, ""),
            "unit c": (30, ""),
        }

        with patch.object(service, "_unit_reference_by_name", return_value=unit_references):
            document = service.generate_lampiran_pengantar_docx(agenda)

        with ZipFile(BytesIO(document)) as archive:
            root = etree.fromstring(archive.read("word/document.xml"))
        roster = service._find_roster_table(root)
        rows = roster.findall("./w:tr", service.NS)
        rendered_rows = [
            (
                service._cell_text(row.findall("./w:tc", service.NS)[1]),
                service._cell_text(row.findall("./w:tc", service.NS)[3]),
            )
            for row in rows[1:]
        ]

        self.assertEqual(len(rows), 5)
        self.assertEqual(
            rendered_rows,
            [
                ("Luring Unit A123456789012345674", "Fisik"),
                ("Luring Unit B123456789012345673", "Fisik"),
                ("Luring Unit C123456789012345672", "Fisik"),
                ("Daring Unit A123456789012345671", "Virtual"),
            ],
        )

    def test_monitoring_export_counts_selected_modes_and_excluded_pendamping_by_unit(self):
        agenda = SimpleNamespace(
            people=[
                SimpleNamespace(
                    source_no="1",
                    unit_eselon_ii="Unit A",
                    selected=True,
                    modality="daring",
                ),
                SimpleNamespace(
                    source_no="2",
                    unit_eselon_ii="Unit A",
                    selected=True,
                    modality="luring",
                ),
                SimpleNamespace(
                    source_no="Pendamping",
                    unit_eselon_ii="Unit A",
                    selected=False,
                    modality=None,
                ),
                SimpleNamespace(
                    source_no="3",
                    unit_eselon_ii="Unit B",
                    selected=False,
                    modality="daring",
                ),
                SimpleNamespace(
                    source_no="Pendamping",
                    unit_eselon_ii="",
                    selected=True,
                    modality="daring",
                ),
            ]
        )

        workbook = load_workbook(BytesIO(service.export_monitoring_excel(agenda)))
        worksheet = workbook["Monitoring Pelantikan"]
        rows = list(worksheet.values)

        self.assertEqual(
            rows[0],
            ("Unit Eselon II", "Daring", "Luring", "Pendamping (excluded)"),
        )
        self.assertEqual(rows[1], ("Unit A", 1, 1, 1))
        self.assertEqual(rows[2], ("Unit Eselon II tidak ditemukan", 0, 0, 1))
        self.assertEqual(len(rows), 3)
        self.assertEqual(worksheet.freeze_panes, "A2")
        workbook.close()

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

    def test_roster_document_uses_database_current_job_not_proposed_job(self):
        table = etree.fromstring(
            f"""<w:tbl xmlns:w="{service.W_NS}">
              <w:tr>
                <w:tc><w:p><w:r><w:t>No</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Nama/NIP</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Jabatan Saat ini</w:t></w:r></w:p></w:tc>
              </w:tr>
              <w:tr>
                <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Template</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Template</w:t></w:r></w:p></w:tc>
              </w:tr>
            </w:tbl>"""
        )
        service._populate_roster(
            table,
            [
                SimpleNamespace(
                    nama="Nama Pegawai",
                    nip="123456789012345678",
                    jabatan="Jabatan saat ini dari database",
                    unit_eselon_ii="Unit A",
                    eselon="II",
                    source_usul_jabatan_baru="Jabatan baru rahasia",
                )
            ],
        )

        data_row = table.findall("./w:tr", service.NS)[1]
        job_cell = data_row.findall("./w:tc", service.NS)[2]
        job_text = service._cell_text(job_cell)
        self.assertIn("Jabatan saat ini dari database", job_text)
        self.assertNotIn("Jabatan baru rahasia", job_text)

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

    def test_selective_generation_returns_docx_for_one_complete_group(self):
        agenda = SimpleNamespace(
            tanggal_pelantikan=date(2026, 9, 20),
            people=[
                SimpleNamespace(
                    id=1,
                    row_number=1,
                    source_no=None,
                    source_sheet=None,
                    selected=True,
                    lookup_status="matched",
                    modality="daring",
                    unit_eselon_ii="Unit A",
                    nip="123456789012345671",
                ),
                SimpleNamespace(
                    id=2,
                    row_number=2,
                    source_no=None,
                    source_sheet=None,
                    selected=True,
                    lookup_status="matched",
                    modality="daring",
                    unit_eselon_ii="Unit A",
                    nip="123456789012345672",
                ),
            ],
            last_generated_at=None,
            status="ready",
        )
        db = SimpleNamespace(commit=lambda: None)

        with patch.object(service, "build_agenda_docx", return_value=b"docx") as build:
            data, filename, media_type, group_count = (
                service.generate_selected_agenda_documents(db, agenda, [1, 2])
            )

        self.assertEqual(data, b"docx")
        self.assertTrue(filename.endswith(".docx"))
        self.assertEqual(
            media_type,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.assertEqual(group_count, 1)
        self.assertEqual(len(build.call_args.args[1]), 2)

    def test_selective_generation_returns_zip_for_multiple_groups(self):
        agenda = SimpleNamespace(
            tanggal_pelantikan=date(2026, 9, 20),
            people=[
                SimpleNamespace(
                    id=1,
                    row_number=1,
                    source_no=None,
                    source_sheet=None,
                    selected=True,
                    lookup_status="matched",
                    modality="daring",
                    unit_eselon_ii="Unit A",
                    nip="123456789012345671",
                ),
                SimpleNamespace(
                    id=2,
                    row_number=2,
                    source_no=None,
                    source_sheet=None,
                    selected=True,
                    lookup_status="matched",
                    modality="luring",
                    unit_eselon_ii="Unit B",
                    nip="123456789012345672",
                ),
            ],
            last_generated_at=None,
            status="ready",
        )
        db = SimpleNamespace(commit=lambda: None)

        with patch.object(service, "build_agenda_docx", return_value=b"docx"):
            data, filename, media_type, group_count = (
                service.generate_selected_agenda_documents(db, agenda, [1, 2])
            )

        with ZipFile(BytesIO(data)) as archive:
            filenames = archive.namelist()
        self.assertTrue(filename.endswith(".zip"))
        self.assertEqual(media_type, "application/zip")
        self.assertEqual(group_count, 2)
        self.assertEqual(len(filenames), 2)

    def test_selective_generation_rejects_partial_document_group(self):
        agenda = SimpleNamespace(
            tanggal_pelantikan=date(2026, 9, 20),
            people=[
                SimpleNamespace(
                    id=1,
                    row_number=1,
                    source_no=None,
                    source_sheet=None,
                    selected=True,
                    lookup_status="matched",
                    modality="daring",
                    unit_eselon_ii="Unit A",
                    nip="123456789012345671",
                ),
                SimpleNamespace(
                    id=2,
                    row_number=2,
                    source_no=None,
                    source_sheet=None,
                    selected=True,
                    lookup_status="matched",
                    modality="daring",
                    unit_eselon_ii="Unit A",
                    nip="123456789012345672",
                ),
            ],
            last_generated_at=None,
            status="ready",
        )

        with self.assertRaisesRegex(ValueError, "Pilih seluruh peserta"):
            service.generate_selected_agenda_documents(
                SimpleNamespace(commit=lambda: None),
                agenda,
                [1],
            )

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
                    PelantikanAgendaPerson(
                        row_number=3,
                        nip="123456789012345678",
                        nama="Nama Duplikat",
                        jabatan="Jabatan",
                        unit_eselon_ii="Unit A",
                        lookup_status="duplicate",
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
                        PelantikanPersonChoice(id=person_ids[2], selected=False),
                    ],
                )
                self.assertEqual(updated.status, "ready")
                self.assertTrue(updated.people[0].selected)
                self.assertEqual(updated.people[0].modality, "luring")
                self.assertFalse(updated.people[1].selected)

                with self.assertRaisesRegex(ValueError, "NIP duplikat"):
                    service.save_person_choices(
                        db,
                        updated,
                        [
                            PelantikanPersonChoice(id=person_ids[0], selected=True, modality="luring"),
                            PelantikanPersonChoice(id=person_ids[1], selected=False),
                            PelantikanPersonChoice(id=person_ids[2], selected=True, modality="daring"),
                        ],
                    )

                duplicate_selected = service.save_person_choices(
                    db,
                    updated,
                    [
                        PelantikanPersonChoice(id=person_ids[0], selected=False, modality="luring"),
                        PelantikanPersonChoice(id=person_ids[1], selected=False),
                        PelantikanPersonChoice(id=person_ids[2], selected=True, modality="daring"),
                    ],
                )
                self.assertEqual(duplicate_selected.status, "ready")
                self.assertFalse(duplicate_selected.people[0].selected)
                self.assertTrue(duplicate_selected.people[2].selected)

                deselected = service.save_person_choices(
                    db,
                    duplicate_selected,
                    [
                        PelantikanPersonChoice(id=person_ids[0], selected=False, modality="luring"),
                        PelantikanPersonChoice(id=person_ids[1], selected=False),
                        PelantikanPersonChoice(id=person_ids[2], selected=False, modality="daring"),
                    ],
                )
                self.assertEqual(deselected.status, "draft")
                self.assertFalse(deselected.people[0].selected)
                self.assertEqual(deselected.people[0].modality, "luring")
                self.assertFalse(deselected.people[2].selected)
        finally:
            Base.metadata.drop_all(test_engine)
            test_engine.dispose()

    def test_generate_rejects_multiple_selected_rows_for_same_nip(self):
        people = [
            SimpleNamespace(
                selected=True,
                source_no=None,
                nip="123456789012345678",
                lookup_status="matched",
                modality="daring",
                unit_eselon_ii="Unit A",
            ),
            SimpleNamespace(
                selected=True,
                source_no=None,
                nip="123456789012345678",
                lookup_status="duplicate",
                modality="luring",
                unit_eselon_ii="Unit A",
            ),
        ]
        agenda = SimpleNamespace(people=people)

        with self.assertRaisesRegex(ValueError, "NIP duplikat"):
            service.generate_agenda_zip(SimpleNamespace(), agenda)

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
                                "default_modality": "luring",
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
                self.assertEqual(updated.people[0].modality, "luring")
                self.assertEqual(updated.people[0].row_number, 5)
                self.assertEqual(updated.people[0].source_no, "1")
                self.assertEqual(
                    updated.people[0].source_nama_nip,
                    "Nama Excel, S.E., MBus Process Mgt.\n123456789012345678",
                )
                self.assertEqual(updated.people[0].source_jabatan_saat_ini, "Jabatan lama")
                self.assertEqual(updated.people[0].source_usul_jabatan_baru, "Jabatan usulan")
                self.assertEqual(updated.people[0].source_sheet, "Sheet")
                self.assertEqual(updated.people[0].source_row_number, 5)
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

    def test_all_sheets_import_tracks_provenance_skips_invalid_and_keeps_first_duplicate(self):
        workbook = Workbook()
        empty_sheet = workbook.active
        empty_sheet.title = "Kosong"
        empty_sheet.append(["Daftar pegawai"])
        empty_sheet.append([])
        empty_sheet.append([
            "No",
            "Nama/NIP",
            "Jabatan Saat ini",
            "Usul Jabatan Baru",
        ])

        def add_roster_sheet(name, rows):
            worksheet = workbook.create_sheet(name)
            worksheet.append(["Daftar pegawai"])
            worksheet.append([])
            worksheet.append([
                "No",
                "Nama/NIP",
                "Jabatan Saat ini",
                "Usul Jabatan Baru",
            ])
            for row in rows:
                worksheet.append(row)

        first_nip = "123456789012345678"
        second_nip = "234567890123456789"
        add_roster_sheet("Alpha", [[1, f"Nama Alpha\n{first_nip}", "Excel lama", "Usulan A"]])
        add_roster_sheet(
            "Beta",
            [
                [1, f"Nama duplikat\n{first_nip}", "Excel lama", "Usulan duplikat"],
                [2, f"Nama Beta\n{second_nip}", "Excel lama", "Usulan B"],
            ],
        )
        notes = workbook.create_sheet("Catatan")
        notes.append(["Informasi"])
        notes.append([])
        notes.append(["Catatan"])
        notes.append(["Bukan roster"])

        workbook_data = BytesIO()
        workbook.save(workbook_data)

        test_engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(test_engine)
        try:
            with Session(test_engine) as db:
                agenda = PelantikanAgenda(
                    id="agenda-all-sheets",
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
                employee_record = {
                    "nama": "Nama Database",
                    "jabatan": "Jabatan Database",
                    "unit_eselon_ii": "Unit A",
                    "eselon": "III",
                }
                with patch.object(
                    service,
                    "_lookup_employee_records",
                    return_value={
                        first_nip: employee_record,
                        second_nip: employee_record,
                    },
                ):
                    updated, processed_sheets, skipped_sheets, duplicate_count = (
                        service.upload_all_sheets_and_match(
                            db,
                            agenda,
                            workbook_data.getvalue(),
                            "pegawai.xlsx",
                        )
                    )

                self.assertEqual(processed_sheets, ["Alpha", "Beta"])
                self.assertEqual(skipped_sheets, ["Kosong", "Catatan"])
                self.assertEqual(duplicate_count, 1)
                self.assertEqual(updated.workflow_mode, "all_sheets")
                self.assertEqual(updated.import_strategy, "all_sheets")
                self.assertEqual(updated.uploaded_sheet, "Semua sheet")
                self.assertEqual([person.row_number for person in updated.people], [1, 2, 3])
                self.assertEqual(
                    [(person.source_sheet, person.source_row_number) for person in updated.people],
                    [("Alpha", 4), ("Beta", 4), ("Beta", 5)],
                )
                self.assertEqual(
                    [person.lookup_status for person in updated.people],
                    ["matched", "duplicate", "matched"],
                )

                for person in updated.people:
                    if person.lookup_status == "matched":
                        person.selected = True
                        person.modality = "daring"
                grouped_people = []

                def capture_group(_agenda, people, _modality, unit):
                    grouped_people.append((unit, [person.source_sheet for person in people]))
                    return b"docx"

                with patch.object(service, "build_agenda_docx", side_effect=capture_group):
                    _, group_count = service.generate_agenda_zip(db, updated)

                self.assertEqual(group_count, 1)
                self.assertEqual(grouped_people, [("Unit A", ["Alpha", "Beta"])])

                with patch.object(
                    service,
                    "_lookup_employee_records",
                    return_value={
                        first_nip: employee_record,
                        second_nip: employee_record,
                    },
                ):
                    selected, selected_sheets, _, _ = service.upload_sheets_and_match(
                        db,
                        agenda,
                        workbook_data.getvalue(),
                        "pegawai.xlsx",
                        "selected_sheets",
                        ["Beta"],
                    )

                self.assertEqual(selected.import_strategy, "selected_sheets")
                self.assertEqual(selected_sheets, ["Beta"])
                self.assertEqual([person.source_sheet for person in selected.people], ["Beta", "Beta"])

                with patch.object(
                    service,
                    "_lookup_employee_records",
                    return_value={first_nip: employee_record},
                ):
                    single_sheet, single_sheets, _, _ = service.upload_sheets_and_match(
                        db,
                        agenda,
                        workbook_data.getvalue(),
                        "pegawai.xlsx",
                        "single_sheet",
                        ["Alpha"],
                    )

                self.assertEqual(single_sheet.workflow_mode, "all_sheets")
                self.assertEqual(single_sheet.import_strategy, "single_sheet")
                self.assertEqual(single_sheets, ["Alpha"])
                self.assertEqual([person.source_sheet for person in single_sheet.people], ["Alpha"])

                with patch.object(
                    service,
                    "_lookup_employee_records",
                    return_value={
                        first_nip: employee_record,
                        second_nip: employee_record,
                    },
                ):
                    isolated, _, _, _ = service.upload_sheets_and_match(
                        db,
                        agenda,
                        workbook_data.getvalue(),
                        "pegawai.xlsx",
                        "isolated_sheets",
                    )
                self.assertEqual(isolated.import_strategy, "isolated_sheets")
                for person in isolated.people:
                    if person.lookup_status == "matched":
                        person.selected = True
                        person.modality = "daring"
                isolated_groups = []

                def capture_isolated_group(_agenda, people, _modality, unit):
                    isolated_groups.append((unit, [person.source_sheet for person in people]))
                    return b"docx"

                with patch.object(service, "build_agenda_docx", side_effect=capture_isolated_group):
                    _, isolated_group_count = service.generate_agenda_zip(db, isolated)

                self.assertEqual(isolated_group_count, 2)
                self.assertEqual(
                    isolated_groups,
                    [("Unit A", ["Alpha"]), ("Unit A", ["Beta"])],
                )
        finally:
            Base.metadata.drop_all(test_engine)
            test_engine.dispose()


if __name__ == "__main__":
    unittest.main()
