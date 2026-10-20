from typing import Dict, List


def get_rules() -> Dict:
    # Rules ported from `Cleaning Logic/Sitasi EsIII.txt`
    return {
        "skiprows": 2,
        "delete_positions": [3,4,8,15,17,18,19],
        "delete_rows_null_columns": [2],
        "rename_columns": {
            1: "No",
            2: "Nama/NIP",
            5: "Usia (Th)",
            6: "Usia (Bl)",
            7: "Golongan",
            9: "Jabatan Saat Ini",
            10: "Lama Jab (Th)",
            11: "Lama Jab (Bl)",
            12: "Tour of Area",
            13: "Tour of Duty",
            14: "Jabatan Baru",
            16: "Keterangan",
        },
    }
# def get_rules() -> Dict:
#     # Rules ported from `Cleaning Logic/Sitasi EsIII.txt`
#     return {
#         "skiprows": 1,
#         "delete_positions": [3, 4, 8, 15, 17, 18, 19],
#         "delete_rows_null_columns": [],
#         "delete_rows_contains": [{"column": 4, "contains": "."}],
#         "rename_columns": {
#             1: "No",
#             2: "Nama/NIP",
#             5: "Usia (Th)",
#             6: "Usia (Bl)",
#             7: "Golongan",
#             9: "Jabatan Saat Ini",
#             10: "Lama Jab (Th)",
#             11: "Lama Jab (Bl)",
#             12: "Tour of Area",
#             13: "Tour of Duty",
#             14: "Jabatan Baru",
#             16: "Keterangan",
#         },
#     }
 