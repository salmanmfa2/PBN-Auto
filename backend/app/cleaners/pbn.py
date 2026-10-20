from typing import Dict, List


def get_rules() -> Dict:
    # Rules ported from `Cleaning Logic/PBN Open.txt`
    return {
        "skiprows": 0,
        "delete_positions": [1, 2, 5, 6, 7, 8, 9, 10, 13, 28, 31, 32, 33, 45, 46, 48, 49, 50, 51],
        "delete_rows_null_columns": [],
        "rename_columns": {
            36: "MKerja Unit Eselon II (Th)",
            37: "MKerja Unit Eselon II (Bl)",
            39: "MKerja Unit Eselon III (Th)",
            40: "MKerja Unit Eselon III (Bl)",
            42: "MKerja Unit Eselon IV (Th)",
            43: "MKerja Unit Eselon IV (Bl)",
            52: "MKerja Golongan (Th)",
            53: "MKerja Golongan (Bl)",
            54: "MKerja Seluruhnya (Th)",
            55: "MKerja Seluruhnya (Bl)",
        },
    }
