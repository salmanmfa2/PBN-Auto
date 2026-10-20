from typing import Dict


def get_rules() -> Dict:
    # Rules ported from `Cleaning Logic/PBN Open + Edu + HB.txt`
    return {
        "skiprows": 0,
        "delete_positions": [
            1, 2, 5, 6, 7, 8, 9, 10, 13, 28,
            31, 32, 33, 45, 46, 48, 49, 50, 51,52, 53, 54, 55,
            57, 58, 59,61, 62, 63, 64, 65, 66,
            69,72, 73, 74,76,
            77, 78, 79, 80, 81, 82, 83, 84, 85,
            87,89, 90,
        ],
        "delete_rows_null_columns": [],
        "rename_columns": {
            36: "MKerja Unit Eselon II (Th)",
            37: "MKerja Unit Eselon II (Bl)",
            39: "MKerja Unit Eselon III (Th)",
            40: "MKerja Unit Eselon III (Bl)",
            42: "MKerja Unit Eselon IV (Th)",
            43: "MKerja Unit Eselon IV (Bl)",
            60: "Region Homebase",
            67: "Jurusan",
            68: "Universitas/Sekolah Tinggi",
            70: "Pembiayaan",
            71: "IPK",
        },
    }
