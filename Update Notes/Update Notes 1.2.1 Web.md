# Update Notes: Web Version 1.2.1

## Scope

Version 1.2.1 adds the web-only **Generate ND Undangan Pelantikan** workflow. It does not change the desktop application or add this menu to the desktop app. For the broader Web 1.2 behavior, see [Update Notes 1.2 Web](./Update%20Notes%201.2%20Web.md).

## Generate ND Undangan Pelantikan

### Agenda workflow

- The menu opens on the signed-in user's agenda history. Agenda creation is available from a popup; each user can manage only agendas they created.
- An agenda stores the pelantikan date, ND number and date, pelantikan time, dress code, and `level_jabatan`. The weekday is inferred from the pelantikan date.
- `Level jabatan` is selected from Administrator or Tinggi Pratama. `Dresscode` offers Wastra Nusantara, PSL Lengkap, or Lainnya with a custom text value.
- Agenda cards show the number of days until pelantikan; dates before the current Jakarta date are tagged Berakhir.
- Any signed-in User, Admin, or Super Admin can use the feature. Guest access is not allowed.
- The history list is wide and left-aligned. Each agenda card has a compact delete icon with confirmation.

### Workbook import and matching

- Upload one `.xlsx` or `.xls` workbook per agenda. The first two rows are skipped and the third row is used as the header.
- Rows with an empty `Nama/NIP` value are removed. The NIP is extracted from the last non-empty line of `Nama/NIP` and matched against `pbncleaner.fetch_pbnopen`.
- The review table retains the workbook's `No`, `Nama/NIP`, `Jabatan Saat ini/Grade`, and `Usul Jabatan Baru/Grade` fields alongside lookup results.
- `Pendamping` rows marked in the `No` column are always excluded. **Pilih Semua** selects eligible matched employees only; unmatched employees and employees without a Unit Eselon II are ignored.
- Duplicate NIPs may be selected only on their first occurrence. Each selected employee is assigned Daring or Luring.

### Preview and document generation

- Before generating a ZIP, users can preview expandable lists grouped by Unit Eselon II and Daring/Luring. Each group corresponds to one DOCX file.
- Formal recipient labels are derived for recognized unit names: `Kanwil DJPb Prov.` becomes `Kepala Kantor Wilayah Direktorat Jenderal Perbendaharaan Provinsi`; `Direktorat` becomes `Direktur`; and `Badan` becomes `Kepala Badan`. Unrecognized unit names are preserved.
- In the generated roster, append the expanded Unit Eselon II name to `Jabatan` only when the employee has a known `eselon` other than 2. Eselon II employees and records without an `eselon` value keep the title alone.
- Only app-owned parenthesized template placeholders are replaced. Official square-bracket placeholders such as `[@NomorND]` and `[@TanggalND]` remain unchanged.
- Documents are grouped by Unit Eselon II and modality and downloaded together in a ZIP.

### Data retention and database

- The original workbook and generated DOCX/ZIP files are not retained. The agenda and participant snapshot are saved so the owner can resume later; reuploading replaces that agenda's participant snapshot.
- The snapshot includes the four displayed workbook fields, lookup data (including `eselon`), and the employee's selection and modality.
- Application startup adds missing snapshot columns to an existing `pelantikan_agenda_people` table. Fresh database setup is described in `backend/sql/005_create_pelantikan_agendas.sql`.
- No new frontend or backend dependencies were added.

## Plt./Plh. employee lookup

- Admin and Super Admin can search PBN Open by employee name or NIP when entering the replacement official. Selecting a result fills the name and definitive job title; the selected NIP is stored as a snapshot on the existing monitoring record.
- Definitive job titles use the shared formatting rule: append the expanded Unit Eselon II only when Eselon is known and not II. Other monitoring fields remain manual.
- The lookup reuses `pbncleaner.fetch_pbnopen`; no new employee table is required. Fresh monitoring schemas include the nullable NIP field, and startup adds it to existing installations.

## Magnetic toolbar

- Dragging the global clock toolbar snaps it to the nearest screen edge on release.
- A short transition softens the snap; resizing the browser repositions a manually placed toolbar to keep it aligned and within view.

## Dynamic network host discovery

- Network launch now detects the active Wi-Fi/LAN IPv4 address and uses it for the app URL, frontend API URL, and backend CORS origin.
- The backend launcher continues to choose the next available port when its configured port is occupied.
- `config.json` uses `host: "auto"` by default. A hostname or reserved address can still be set as an explicit override; if DHCP later changes the address, restart the launcher and share its updated URL.

## Implementation and verification

- Frontend: `frontend/src/pages/PelantikanAgendaPage.tsx`, `frontend/src/services/api.ts`, and `frontend/src/types/index.ts`.
- Backend: `backend/app/api/pelantikan_agenda.py`, `backend/app/services/pelantikan_agenda/`, `backend/app/models/pelantikan_agenda.py`, and `backend/app/schemas/pelantikan_agenda.py`.
- Verification: 7 focused Plt./Plh. tests and 9 Pelantikan tests passed; toolbar lint and the frontend production build passed. The build reports the existing advisory for a JavaScript chunk over 500 kB. Full backend unittest discovery did not complete under Python 3.14, and the live PBN Open lookup/database migration has not been tested against the production database.
