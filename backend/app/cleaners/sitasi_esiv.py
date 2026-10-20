from typing import Dict, List


def get_rules() -> Dict:
    # Rules ported from `Cleaning Logic/Sitasi EsIV.txt`
    return {
        "skiprows": 7,
        "delete_positions": [6,7,11,12,13,15],
        "delete_rows_null_columns": [2],
        "rename_columns": {
            1: "No",
            2: "Nama/NIP",
            3: "Usia",
            4: "Pangkat/Gol/TMT",
            5: "Jabatan Lama",
            8: "TMT Jabatan Lama",
            9: "Tour of Area",
            10: "Jabatan Baru",
        },
    }
