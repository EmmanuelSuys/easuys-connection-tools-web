/**
 * Cited product data of the ETA bracket checks: a verbatim copy of WoodSection/eta_connectors_data.json
 * (EA_Suys0 scripts, main b41f069, SHA-256 896321c08b62fb00a1a83edfa2db63c90c130c405b2427013e7e0ecfe7d0c9bb).
 * Every value sits under source -> annex/table -> nailing pattern -> column -> load duration, so each value used
 * carries its full citation. Units kN, mm. Do not edit by hand: re-copy from the scripts repository and update
 * tests/fixtures/timber_special_python.json (validation/timber_special_capture.py).
 */
export const ETA_DATA_SHA256 = "896321c08b62fb00a1a83edfa2db63c90c130c405b2427013e7e0ecfe7d0c9bb";
export const ETA_DATA = {
    "schema_version": 1,
    "note": "Cited product data for WoodSection/eta_connectors.py. Every value sits under source -> annex/table -> nailing pattern -> column -> load duration, so the module builds the full citation (ETA number, issue date, annex, table, row, column) for each value it uses. Values were read from the PDFs named in 'sources' (rendered pages checked by eye, 20/10/2026). Values that could not be read unambiguously are not here; the module asks for them as inputs. Units: kN, mm.",
    "sources": {
        "ETA-06/0106": {
            "issued": "2026-03-09",
            "body": "ETA-Danmark A/S",
            "product": "Simpson Strong-Tie Angle Brackets",
            "pages": 448,
            "replaces": "ETA-06/0106 issued 2021-04-09",
            "pdf_sha256": "17d840fa569d13ec40169c34132c754e4e2a7e58bf73c8b7db627af43caf0d25",
            "url": "https://www.simpson.fr/sites/default/files/field_media_file_2/2026/03/09/183114/eta-06-0106-2026-03-09.pdf"
        },
        "ETA-06/0270": {
            "issued": "2018-02-13",
            "body": "ETA-Danmark A/S",
            "product": "Simpson Strong-Tie Joist Hangers",
            "pages": 185,
            "replaces": "ETA-06/0270 issued 2017-04-27",
            "pdf_sha256": "cdd2e1be8441933c8f71a86e533ec4b63905e6270d0faa41610d16a47c442bdc",
            "note": "The copy on file is the 2018-02-13 issue. Confirm the current issue before use."
        },
        "SST-SBE-NL": {
            "kind": "manufacturer data sheet (not an ETA table)",
            "title": "Simpson Strong-Tie Datasheet SBE - Balkdrager met naar buiten staande flenzen (NL)",
            "pdf_created": "2026-10-11",
            "pdf_sha256": "0cb5b0557bd925555d1c7243c47bfbcb55069dfff831e60fbcb1cf719d030d2d",
            "url": "https://www.strongtie.nl/nl-NL/producten/balkdrager-met-naar-buiten-staande-flenzen-sbe"
        }
    },
    "basis_of_design": {
        "ETA-06/0106": {
            "annex": "C1",
            "page": 22,
            "design_value_R_k_x_kmod": "R_d = (R_k x k_mod) / gamma_M (tables in 'R_k x k_mod', valid for service classes 1 and 2)",
            "design_value_R_k": "R_d = R_k k_mod / gamma_M (tables in characteristic values R_k)",
            "service_class_3": "in proportion to the k_mod values (not encoded)",
            "combined": "(F1/R1)^2 + (F2or3/R2or3)^2 <= 1; F1/R1 + F4or5/R4or5 <= 1; (F1/R1 + F4or5/R4or5)^2 + (F2or3/R2or3)^2 <= 1",
            "forces_annex": "C2, page 23: 2 brackets placed opposite each other; F1 lifting force, F2/F3 lateral along the joint, F4/F5 lateral in the beam direction at height e",
            "density_annex": "C4-2, page 29: values for rho_k = 350 kg/m3; lower rho_k: k_dens = rho_k / 350",
            "nail_annex": "C4-1, page 28: longer 4,0 mm CNA nails or CSA screws allowed with the same capacity; CNA 4,0x50 by interpolation between 4,0x40 and 4,0x60"
        }
    },
    "products": {
        "ABR105": {
            "source": "ETA-06/0106",
            "annex": "D3",
            "geometry": {
                "page": 47,
                "A_mm": 105,
                "B_mm": 105,
                "C_mm": 90,
                "t_mm": 3,
                "holes": {
                    "A": {
                        "d5": 10,
                        "d11": 3
                    },
                    "B": {
                        "d5": 14,
                        "d11": 1
                    }
                }
            },
            "patterns": {
                "1": {
                    "use": "timber",
                    "description": "beam to beam, maximum nailing",
                    "A": {
                        "nails": 10
                    },
                    "B": {
                        "nails": 14
                    }
                },
                "2": {
                    "use": "timber",
                    "description": "beam to beam, minimum nailing",
                    "A": {
                        "nails": 6
                    },
                    "B": {
                        "nails": 6
                    }
                },
                "3": {
                    "use": "rigid",
                    "description": "beam (A) to rigid support (B), maximum nailing",
                    "A": {
                        "nails": 10
                    },
                    "B": {
                        "bolts": 1
                    }
                },
                "4": {
                    "use": "rigid",
                    "description": "beam (A) to rigid support (B), minimum nailing",
                    "A": {
                        "nails": 6
                    },
                    "B": {
                        "bolts": 1
                    }
                },
                "5": {
                    "use": "column",
                    "description": "beam (A) to column (B)",
                    "A": {
                        "nails": 6
                    },
                    "B": {
                        "nails": 14
                    }
                },
                "6": {
                    "use": "timber_ssh",
                    "description": "beam to beam with SSH screws (Table D3-10)",
                    "A": {
                        "ssh": 3
                    },
                    "B": {
                        "ssh": 1
                    }
                },
                "7": {
                    "use": "rigid_ssh",
                    "description": "beam (B) to rigid support (A), 2 M10 + 1 SSH (Table D3-11)",
                    "A": {
                        "bolts": 2
                    },
                    "B": {
                        "ssh": 1
                    }
                },
                "page": 48
            },
            "tables": {
                "D3-1": {
                    "page": 49,
                    "title": "Modified characteristic capacity timber beam to timber beam - 2 Angle Brackets",
                    "kind": "R_k_x_kmod",
                    "brackets": 2,
                    "use": "timber",
                    "R45_form": "(a*b + c)/(e - 10.7) <= max",
                    "rows": {
                        "1": {
                            "R1": {
                                "4.0x40": {
                                    "P": 6.5,
                                    "L": 7.5,
                                    "M": 8.6,
                                    "S": 9.7,
                                    "I": 11.9
                                },
                                "4.0x60": {
                                    "P": 10.7,
                                    "L": 12.5,
                                    "M": 14.3,
                                    "S": 16.1,
                                    "I": 19.7
                                }
                            },
                            "R1_wane": {
                                "4.0x40": {
                                    "P": 2.8,
                                    "L": 3.6,
                                    "M": 4.5,
                                    "S": 5.5,
                                    "I": 7.7
                                },
                                "4.0x60": {
                                    "P": 6.5,
                                    "L": 8.4,
                                    "M": 10.6,
                                    "S": 11.7,
                                    "I": 13.8
                                }
                            },
                            "R23": {
                                "4.0x40": {
                                    "P": 8.7,
                                    "L": 10.2,
                                    "M": 11.6,
                                    "S": 13.1,
                                    "I": 16
                                },
                                "4.0x60": {
                                    "P": 12.2,
                                    "L": 14.2,
                                    "M": 16.2,
                                    "S": 18.2,
                                    "I": 22.3
                                }
                            },
                            "R45": {
                                "4.0x40": {
                                    "P": [
                                        11,
                                        568,
                                        9.7
                                    ],
                                    "L": [
                                        11.5,
                                        566,
                                        10.8
                                    ],
                                    "M": [
                                        11.9,
                                        565,
                                        11.9
                                    ],
                                    "S": [
                                        12.4,
                                        563,
                                        12.9
                                    ],
                                    "I": [
                                        13.3,
                                        560,
                                        15.1
                                    ]
                                },
                                "4.0x60": {
                                    "P": [
                                        12.8,
                                        562,
                                        14
                                    ],
                                    "L": [
                                        13.5,
                                        559,
                                        15.8
                                    ],
                                    "M": [
                                        14.3,
                                        557,
                                        17.5
                                    ],
                                    "S": [
                                        15,
                                        554,
                                        19.3
                                    ],
                                    "I": [
                                        16.5,
                                        549,
                                        22.8
                                    ]
                                }
                            }
                        },
                        "2": {
                            "R1": {
                                "4.0x40": {
                                    "P": 3.6,
                                    "L": 4.1,
                                    "M": 4.7,
                                    "S": 5.3,
                                    "I": 6.5
                                },
                                "4.0x60": {
                                    "P": 5.9,
                                    "L": 6.9,
                                    "M": 7.9,
                                    "S": 8.9,
                                    "I": 10.8
                                }
                            },
                            "R1_wane": {
                                "4.0x40": {
                                    "P": 3.6,
                                    "L": 4.1,
                                    "M": 4.7,
                                    "S": 5.3,
                                    "I": 6.5
                                },
                                "4.0x60": {
                                    "P": 5.9,
                                    "L": 6.9,
                                    "M": 7.9,
                                    "S": 8.9,
                                    "I": 10.4
                                }
                            },
                            "R23": {
                                "4.0x40": {
                                    "P": 4.6,
                                    "L": 5.4,
                                    "M": 6.2,
                                    "S": 6.9,
                                    "I": 8.5
                                },
                                "4.0x60": {
                                    "P": 7,
                                    "L": 8.1,
                                    "M": 9.3,
                                    "S": 10.5,
                                    "I": 12.8
                                }
                            },
                            "R45": {
                                "4.0x40": {
                                    "P": [
                                        10.2,
                                        601,
                                        6.8
                                    ],
                                    "L": [
                                        10.6,
                                        601,
                                        7.3
                                    ],
                                    "M": [
                                        10.9,
                                        600,
                                        7.9
                                    ],
                                    "S": [
                                        11.2,
                                        599,
                                        8.5
                                    ],
                                    "I": [
                                        11.8,
                                        598,
                                        9.6
                                    ]
                                },
                                "4.0x60": {
                                    "P": [
                                        11.5,
                                        599,
                                        9
                                    ],
                                    "L": [
                                        12,
                                        598,
                                        10
                                    ],
                                    "M": [
                                        12.5,
                                        597,
                                        10.9
                                    ],
                                    "S": [
                                        13,
                                        596,
                                        11.9
                                    ],
                                    "I": [
                                        14.1,
                                        595,
                                        13.7
                                    ]
                                }
                            }
                        }
                    }
                },
                "D3-2": {
                    "page": 50,
                    "duration": "P",
                    "title": "Modified characteristic capacity timber beam to timber beam - 1 Angle Bracket Load duration P",
                    "kind": "R_k_x_kmod",
                    "brackets": 1,
                    "use": "timber",
                    "rows": {
                        "1": {
                            "R1": {
                                "4.0x40": [
                                    {
                                        "to": 40,
                                        "form": "k/(x+s)",
                                        "k": 188,
                                        "s": 60
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 73,
                                        "s": 0
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 55,
                                        "form": "k/(x+s)",
                                        "k": 259,
                                        "s": 60
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 122,
                                        "s": 0
                                    }
                                ]
                            },
                            "R23": {
                                "4.0x40": 4.4,
                                "4.0x60": 6.1
                            },
                            "R4": {
                                "4.0x40": [
                                    {
                                        "to": 29,
                                        "form": "const",
                                        "c": 6.6
                                    },
                                    {
                                        "to": 166,
                                        "form": "k/(x+s)",
                                        "k": 190,
                                        "s": 0
                                    },
                                    {
                                        "to": 500,
                                        "form": "k/(x+s)",
                                        "k": 82,
                                        "s": -85
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 31,
                                        "form": "const",
                                        "c": 8.5
                                    },
                                    {
                                        "to": 187,
                                        "form": "k/(x+s)",
                                        "k": 261,
                                        "s": 0
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 137,
                                        "s": -85
                                    }
                                ]
                            },
                            "R4_wane": {
                                "4.0x40": {
                                    "below": 37.5,
                                    "k": 92
                                },
                                "4.0x60": {
                                    "below": 37.5,
                                    "k": 153
                                }
                            },
                            "R5": {
                                "4.0x40": [
                                    {
                                        "to": 72,
                                        "form": "k/(s-x)",
                                        "k": 82,
                                        "s": 85
                                    },
                                    {
                                        "to_b": [
                                            1.78,
                                            2
                                        ],
                                        "form": "const",
                                        "c": 6.2
                                    },
                                    {
                                        "form": "(a*b+c)/(x+s)",
                                        "a": 11,
                                        "c": -513,
                                        "s": -85
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 68,
                                        "form": "k/(s-x)",
                                        "k": 137,
                                        "s": 85
                                    },
                                    {
                                        "to_b": [
                                            1.59,
                                            6
                                        ],
                                        "form": "const",
                                        "c": 8.1
                                    },
                                    {
                                        "form": "(a*b+c)/(x+s)",
                                        "a": 12.8,
                                        "c": -636,
                                        "s": -85
                                    }
                                ]
                            }
                        }
                    }
                },
                "D3-3": {
                    "page": 51,
                    "duration": "L",
                    "title": "Modified characteristic capacity timber beam to timber beam - 1 Angle Bracket Load duration L",
                    "kind": "R_k_x_kmod",
                    "brackets": 1,
                    "use": "timber",
                    "rows": {
                        "1": {
                            "R1": {
                                "4.0x40": [
                                    {
                                        "to": 44,
                                        "form": "k/(x+s)",
                                        "k": 206,
                                        "s": 60
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 85,
                                        "s": 0
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 60,
                                        "form": "k/(x+s)",
                                        "k": 289,
                                        "s": 60
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 142,
                                        "s": 0
                                    }
                                ]
                            },
                            "R23": {
                                "4.0x40": 5.1,
                                "4.0x60": 7.1
                            },
                            "R4": {
                                "4.0x40": [
                                    {
                                        "to": 27,
                                        "form": "const",
                                        "c": 7.7
                                    },
                                    {
                                        "to": 175,
                                        "form": "k/(x+s)",
                                        "k": 208,
                                        "s": 0
                                    },
                                    {
                                        "to": 500,
                                        "form": "k/(x+s)",
                                        "k": 96,
                                        "s": -85
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 29,
                                        "form": "const",
                                        "c": 9.9
                                    },
                                    {
                                        "to": 136,
                                        "form": "k/(x+s)",
                                        "k": 291,
                                        "s": 0
                                    },
                                    {
                                        "to": 245,
                                        "form": "k/(x+s)",
                                        "k": 245,
                                        "s": -32.5
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 159,
                                        "s": -85
                                    }
                                ]
                            },
                            "R4_wane": {
                                "4.0x40": {
                                    "below": 37.5,
                                    "k": 107
                                },
                                "4.0x60": {
                                    "below": 37.5,
                                    "k": 179
                                }
                            },
                            "R5": {
                                "4.0x40": [
                                    {
                                        "to": 71,
                                        "form": "k/(s-x)",
                                        "k": 96,
                                        "s": 85
                                    },
                                    {
                                        "to_b": [
                                            1.72,
                                            3
                                        ],
                                        "form": "const",
                                        "c": 6.7
                                    },
                                    {
                                        "form": "(a*b+c)/(x+s)",
                                        "a": 11.5,
                                        "c": -544,
                                        "s": -85
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 67,
                                        "form": "k/(s-x)",
                                        "k": 159,
                                        "s": 85
                                    },
                                    {
                                        "to_b": [
                                            1.53,
                                            7
                                        ],
                                        "form": "const",
                                        "c": 8.9
                                    },
                                    {
                                        "form": "(a*b+c)/(x+s)",
                                        "a": 13.5,
                                        "c": -688,
                                        "s": -85
                                    }
                                ]
                            }
                        }
                    }
                },
                "D3-4": {
                    "page": 52,
                    "duration": "M",
                    "title": "Modified characteristic capacity timber beam to timber beam - 1 Angle Bracket Load duration M",
                    "kind": "R_k_x_kmod",
                    "brackets": 1,
                    "use": "timber",
                    "rows": {
                        "1": {
                            "R1": {
                                "4.0x40": [
                                    {
                                        "to": 48,
                                        "form": "k/(x+s)",
                                        "k": 224,
                                        "s": 60
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 97,
                                        "s": 0
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 65,
                                        "form": "k/(x+s)",
                                        "k": 318,
                                        "s": 60
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 162,
                                        "s": 0
                                    }
                                ]
                            },
                            "R23": {
                                "4.0x40": 5.8,
                                "4.0x60": 8.1
                            },
                            "R4": {
                                "4.0x40": [
                                    {
                                        "to": 26,
                                        "form": "const",
                                        "c": 8.8
                                    },
                                    {
                                        "to": 183,
                                        "form": "k/(x+s)",
                                        "k": 226,
                                        "s": 0
                                    },
                                    {
                                        "to": 500,
                                        "form": "k/(x+s)",
                                        "k": 110,
                                        "s": -85
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 28,
                                        "form": "const",
                                        "c": 11.3
                                    },
                                    {
                                        "to": 104,
                                        "form": "k/(x+s)",
                                        "k": 321,
                                        "s": 0
                                    },
                                    {
                                        "to": 500,
                                        "form": "k/(x+s)",
                                        "k": 245,
                                        "s": -32.5
                                    }
                                ]
                            },
                            "R4_wane": {
                                "4.0x40": {
                                    "below": 37.5,
                                    "k": 123
                                },
                                "4.0x60": {
                                    "below": 37.5,
                                    "k": 204
                                }
                            },
                            "R5": {
                                "4.0x40": [
                                    {
                                        "to": 70,
                                        "form": "k/(s-x)",
                                        "k": 110,
                                        "s": 85
                                    },
                                    {
                                        "to_b": [
                                            1.67,
                                            4
                                        ],
                                        "form": "const",
                                        "c": 7.1
                                    },
                                    {
                                        "form": "(a*b+c)/(x+s)",
                                        "a": 11.9,
                                        "c": -575,
                                        "s": -85
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 66,
                                        "form": "k/(s-x)",
                                        "k": 182,
                                        "s": 85
                                    },
                                    {
                                        "to_b": [
                                            1.48,
                                            8
                                        ],
                                        "form": "const",
                                        "c": 9.6
                                    },
                                    {
                                        "form": "(a*b+c)/(x+s)",
                                        "a": 14.3,
                                        "c": -739,
                                        "s": -85
                                    }
                                ]
                            }
                        }
                    }
                },
                "D3-5": {
                    "page": 53,
                    "duration": "S",
                    "title": "Modified characteristic capacity timber beam to timber beam - 1 Angle Bracket Load duration S",
                    "kind": "R_k_x_kmod",
                    "brackets": 1,
                    "use": "timber",
                    "rows": {
                        "1": {
                            "R1": {
                                "4.0x40": [
                                    {
                                        "to": 52,
                                        "form": "k/(x+s)",
                                        "k": 242,
                                        "s": 60
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 110,
                                        "s": 0
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 69,
                                        "form": "k/(x+s)",
                                        "k": 348,
                                        "s": 60
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 182,
                                        "s": 0
                                    }
                                ]
                            },
                            "R23": {
                                "4.0x40": 6.5,
                                "4.0x60": 9.1
                            },
                            "R4": {
                                "4.0x40": [
                                    {
                                        "to": 25,
                                        "form": "const",
                                        "c": 9.9
                                    },
                                    {
                                        "to": 179,
                                        "form": "k/(x+s)",
                                        "k": 244,
                                        "s": 0
                                    },
                                    {
                                        "from": 195,
                                        "to": 300,
                                        "form": "k/(x+s)",
                                        "k": 245,
                                        "s": -32.5
                                    },
                                    {
                                        "to": 500,
                                        "form": "k/(x+s)",
                                        "k": 123,
                                        "s": -85
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 27,
                                        "form": "const",
                                        "c": 12.9
                                    },
                                    {
                                        "to": 87,
                                        "form": "k/(x+s)",
                                        "k": 351,
                                        "s": 0
                                    },
                                    {
                                        "to": 500,
                                        "form": "k/(x+s)",
                                        "k": 245,
                                        "s": -32.5
                                    }
                                ]
                            },
                            "R4_note": "4,0x40: the table has no value for 179 < e <= 195 mm (gap in the ETA); the module refuses that range",
                            "R4_wane": {
                                "4.0x40": {
                                    "below": 37.5,
                                    "k": 138
                                },
                                "4.0x60": {
                                    "below": 37.5,
                                    "k": 230
                                }
                            },
                            "R5": {
                                "4.0x40": [
                                    {
                                        "to": 69,
                                        "form": "k/(s-x)",
                                        "k": 123,
                                        "s": 85
                                    },
                                    {
                                        "to_b": [
                                            1.63,
                                            5
                                        ],
                                        "form": "const",
                                        "c": 7.6
                                    },
                                    {
                                        "form": "(a*b+c)/(x+s)",
                                        "a": 12.4,
                                        "c": -606,
                                        "s": -85
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 65,
                                        "form": "k/(s-x)",
                                        "k": 205,
                                        "s": 85
                                    },
                                    {
                                        "to_b": [
                                            1.44,
                                            9
                                        ],
                                        "form": "const",
                                        "c": 10.4
                                    },
                                    {
                                        "form": "(a*b+c)/(x+s)",
                                        "a": 15,
                                        "c": -791,
                                        "s": -85
                                    }
                                ]
                            }
                        }
                    }
                },
                "D3-6": {
                    "page": 54,
                    "duration": "I",
                    "title": "Modified characteristic capacity timber beam to timber beam - 1 Angle Bracket Load duration I",
                    "kind": "R_k_x_kmod",
                    "brackets": 1,
                    "use": "timber",
                    "rows": {
                        "1": {
                            "R1": {
                                "4.0x40": [
                                    {
                                        "to": 59,
                                        "form": "k/(x+s)",
                                        "k": 277,
                                        "s": 60
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 134,
                                        "s": 0
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 76,
                                        "form": "k/(x+s)",
                                        "k": 407,
                                        "s": 60
                                    },
                                    {
                                        "form": "k/(x+s)",
                                        "k": 223,
                                        "s": 0
                                    }
                                ]
                            },
                            "R23": {
                                "4.0x40": 8,
                                "4.0x60": 11.2
                            },
                            "R4": {
                                "4.0x40": [
                                    {
                                        "to": 23,
                                        "form": "const",
                                        "c": 12.1
                                    },
                                    {
                                        "to": 110,
                                        "form": "k/(x+s)",
                                        "k": 280,
                                        "s": 0
                                    },
                                    {
                                        "to": 335,
                                        "form": "k/(x+s)",
                                        "k": 245,
                                        "s": -32.5
                                    },
                                    {
                                        "to": 500,
                                        "form": "k/(x+s)",
                                        "k": 151,
                                        "s": -85
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 26,
                                        "form": "const",
                                        "c": 15.8
                                    },
                                    {
                                        "to": 82,
                                        "form": "k/(x+s)",
                                        "k": 407,
                                        "s": 0
                                    },
                                    {
                                        "to": 500,
                                        "form": "k/(x+s)",
                                        "k": 245,
                                        "s": -32.5
                                    }
                                ]
                            },
                            "R4_wane": {
                                "4.0x40": {
                                    "below": 37.5,
                                    "k": 169
                                },
                                "4.0x60": {
                                    "below": 37.5,
                                    "k": 281
                                }
                            },
                            "R5": {
                                "4.0x40": [
                                    {
                                        "to": 67,
                                        "form": "k/(s-x)",
                                        "k": 151,
                                        "s": 85
                                    },
                                    {
                                        "to_b": [
                                            1.55,
                                            7
                                        ],
                                        "form": "const",
                                        "c": 8.6
                                    },
                                    {
                                        "form": "(a*b+c)/(x+s)",
                                        "a": 13.3,
                                        "c": -668,
                                        "s": -85
                                    }
                                ],
                                "4.0x60": [
                                    {
                                        "to": 64,
                                        "form": "k/(s-x)",
                                        "k": 250,
                                        "s": 85
                                    },
                                    {
                                        "to_b": [
                                            1.37,
                                            11
                                        ],
                                        "form": "const",
                                        "c": 12
                                    },
                                    {
                                        "form": "(a*b+c)/(x+s)",
                                        "a": 16.5,
                                        "c": -894,
                                        "s": -85
                                    }
                                ]
                            }
                        }
                    }
                },
                "D3-8": {
                    "page": 55,
                    "title": "Characteristic capacity timber beam to rigid support - 2 Angle Brackets",
                    "kind": "R_k",
                    "brackets": 2,
                    "use": "rigid",
                    "rows": {
                        "3": {
                            "R1": {
                                "4.0x35": 4.08,
                                "4.0x40": 4.88,
                                "4.0x50": 6.48,
                                "4.0x60": 8.08
                            },
                            "R1_kmod_cap": 7.7,
                            "R23": {
                                "4.0x35": 2.25,
                                "4.0x40": 2.68,
                                "4.0x50": 3.55,
                                "4.0x60": 4.37
                            }
                        },
                        "4": {
                            "R1": {
                                "4.0x35": 1.9,
                                "4.0x40": 2.28,
                                "4.0x50": 3.02,
                                "4.0x60": 3.78
                            },
                            "R23": {
                                "4.0x35": 1.6,
                                "4.0x40": 1.9,
                                "4.0x50": 2.52,
                                "4.0x60": 3.09
                            }
                        }
                    },
                    "R45_rule": "R4/5,k = max{R4,k + R5,k (Table D3-9); min{4.6/k_mod; R1,k/2 x b/e}}",
                    "R45_min_term": {
                        "k_over_kmod": 4.6
                    },
                    "bolt_factors": {
                        "k_ax": {
                            "F1": 0.5,
                            "F45_bolt1": "e/b",
                            "F45_bolt2": 0.13
                        },
                        "k_lat": {
                            "F23": 0.5,
                            "F45_bolt2": 1
                        },
                        "rule": "per bolt: R_bolt,d,lateral >= k_lat F_i,d; R_bolt,d,axial >= k_ax F_i,d; and the combination"
                    }
                },
                "D3-9": {
                    "page": 56,
                    "title": "Characteristic capacity timber beam to rigid support - 1 Angle Bracket",
                    "kind": "R_k",
                    "brackets": 1,
                    "use": "rigid",
                    "rows": {
                        "3": {
                            "R1_kmod": {
                                "form": "k/(x+s)",
                                "k": 45.8,
                                "s": 81
                            },
                            "R4_kmod": {
                                "form": "k/(x+s)",
                                "k": 45.28,
                                "s": 0
                            }
                        },
                        "4": {
                            "R1_kmod": {
                                "form": "k/(x+s)",
                                "k": 45.8,
                                "s": 81
                            },
                            "R4_kmod": {
                                "form": "k/(x+s)",
                                "k": 45.28,
                                "s": 0
                            }
                        }
                    },
                    "R23_rule": "half of the values for a connection with 2 ABR105 if the timber is prevented from rotation, otherwise R2/3,k = 0",
                    "R5_note": "R5,k = min{X1/(e - 9.99); X2/(101 - e); 265/(e k_mod)} with X1/X2 per nail size; the rendered table does not show unambiguously which X1/X2 row belongs to which nailing pattern, so R5,k is a required input",
                    "bolt_factors": {
                        "k_ax": {
                            "F1": 1
                        },
                        "note": "k_ax for F4 (e/15) and F5 (e/80) and k_lat are not encoded (units of e not stated)"
                    }
                }
            }
        },
        "ABR90": {
            "source": "ETA-06/0106",
            "annex": "D1",
            "geometry": {
                "page": 31,
                "A_mm": 90,
                "B_mm": 90,
                "C_mm": 65,
                "t_mm": 2.5,
                "holes": {
                    "A": {
                        "d5": 10,
                        "d11": 1
                    },
                    "B": {
                        "d5": 10,
                        "d11": 1
                    }
                }
            },
            "patterns": {
                "1": {
                    "use": "timber",
                    "description": "beam to beam, maximum nailing",
                    "A": {
                        "nails": 8
                    },
                    "B": {
                        "nails": 10
                    }
                },
                "2": {
                    "use": "timber",
                    "description": "beam to beam, minimum nailing",
                    "A": {
                        "nails": 4
                    },
                    "B": {
                        "nails": 6
                    }
                },
                "3": {
                    "use": "steel",
                    "description": "beam (A) to steel (B), maximum nailing (not encoded)"
                },
                "4": {
                    "use": "steel",
                    "description": "beam (A) to steel (B), minimum nailing (not encoded)"
                },
                "5": {
                    "use": "column",
                    "description": "beam (A) to column (B) (not encoded)"
                },
                "page": 32
            },
            "tables": {
                "D1-1": {
                    "page": 33,
                    "title": "Modified characteristic capacity timber beam to timber beam - 2 Angle Brackets",
                    "kind": "R_k_x_kmod",
                    "brackets": 2,
                    "use": "timber",
                    "R45_form": "(a*b + c)/(e - 10.7) <= max",
                    "rows": {
                        "1": {
                            "R1": {
                                "4.0x40": {
                                    "P": 4.8,
                                    "L": 5.6,
                                    "M": 6.4,
                                    "S": 7.1,
                                    "I": 8.7
                                },
                                "4.0x60": {
                                    "P": 8,
                                    "L": 9.3,
                                    "M": 10.6,
                                    "S": 12,
                                    "I": 14.6
                                }
                            },
                            "R1_wane": {
                                "4.0x40": {
                                    "P": 1.4,
                                    "L": 1.8,
                                    "M": 2.2,
                                    "S": 2.7,
                                    "I": 3.8
                                },
                                "4.0x60": {
                                    "P": 3.2,
                                    "L": 4.2,
                                    "M": 5.3,
                                    "S": 6.5,
                                    "I": 9
                                }
                            },
                            "R23": {
                                "4.0x40": {
                                    "P": 5.6,
                                    "L": 6.5,
                                    "M": 7.4,
                                    "S": 8.3,
                                    "I": 10.2
                                },
                                "4.0x60": {
                                    "P": 7.1,
                                    "L": 8.3,
                                    "M": 9.5,
                                    "S": 10.6,
                                    "I": 13
                                }
                            },
                            "R45": {
                                "4.0x40": {
                                    "P": [
                                        6.3,
                                        431,
                                        7.8
                                    ],
                                    "L": [
                                        6.5,
                                        431,
                                        8.8
                                    ],
                                    "M": [
                                        6.7,
                                        430,
                                        9.7
                                    ],
                                    "S": [
                                        7,
                                        430,
                                        10.7
                                    ],
                                    "I": [
                                        7.4,
                                        430,
                                        12.7
                                    ]
                                },
                                "4.0x60": {
                                    "P": [
                                        7.2,
                                        430,
                                        11.7
                                    ],
                                    "L": [
                                        7.59,
                                        429,
                                        13.4
                                    ],
                                    "M": [
                                        7.98,
                                        429,
                                        15
                                    ],
                                    "S": [
                                        8.37,
                                        429,
                                        16.6
                                    ],
                                    "I": [
                                        9.15,
                                        428,
                                        19.9
                                    ]
                                }
                            }
                        },
                        "2": {
                            "R1": {
                                "4.0x40": {
                                    "P": 3.2,
                                    "L": 3.7,
                                    "M": 4.3,
                                    "S": 4.8,
                                    "I": 5.9
                                },
                                "4.0x60": {
                                    "P": 5.3,
                                    "L": 6.2,
                                    "M": 7.1,
                                    "S": 8,
                                    "I": 9.7
                                }
                            },
                            "R1_wane": {
                                "4.0x40": {
                                    "P": 1,
                                    "L": 1.3,
                                    "M": 1.6,
                                    "S": 2,
                                    "I": 2.7
                                },
                                "4.0x60": {
                                    "P": 2.3,
                                    "L": 3,
                                    "M": 3.7,
                                    "S": 4.5,
                                    "I": 6.4
                                }
                            },
                            "R23": {
                                "4.0x40": {
                                    "P": 3.4,
                                    "L": 4,
                                    "M": 4.6,
                                    "S": 5.1,
                                    "I": 6.3
                                },
                                "4.0x60": {
                                    "P": 4.4,
                                    "L": 5.1,
                                    "M": 5.9,
                                    "S": 6.6,
                                    "I": 8.1
                                }
                            },
                            "R45": {
                                "4.0x40": {
                                    "P": [
                                        6.1,
                                        431,
                                        5.1
                                    ],
                                    "L": [
                                        6.2,
                                        431,
                                        5.6
                                    ],
                                    "M": [
                                        6.4,
                                        431,
                                        6.1
                                    ],
                                    "S": [
                                        6.6,
                                        431,
                                        6.7
                                    ],
                                    "I": [
                                        7,
                                        430,
                                        7.7
                                    ]
                                },
                                "4.0x60": {
                                    "P": [
                                        6.84,
                                        430,
                                        7.2
                                    ],
                                    "L": [
                                        7.17,
                                        430,
                                        8
                                    ],
                                    "M": [
                                        7.5,
                                        430,
                                        8.9
                                    ],
                                    "S": [
                                        7.83,
                                        429,
                                        9.8
                                    ],
                                    "I": [
                                        8.49,
                                        429,
                                        11.5
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        },
        "SBE80/150": {
            "source": "SST-SBE-NL",
            "eta": "ETA-06/0270",
            "eta_annex": "D39",
            "geometry": {
                "datasheet_page": 2,
                "A_mm": 80,
                "B_mm": 150,
                "t_mm": 1.5,
                "holes": {
                    "header": {
                        "d5": 18,
                        "d11": 4
                    },
                    "joist": {
                        "d5": 12
                    }
                },
                "joist_width_mm": 80,
                "joist_h_min_mm": 163,
                "joist_h_max_mm": 225,
                "eta_blank": 380,
                "eta_check": "ETA-06/0270 (2018-02-13) Annex D39 page 167, blank 380: A 32-101 mm, B = (380 - A)/2 = 150 mm for A = 80, t 1.5 mm, header 18 x d5 + 4 x d11, joist 12 x d5 (same as the data sheet)"
            },
            "eta_model_parameters": {
                "note": "ETA-06/0270 gives the SBE capacity through the Annex C model with these parameters (full nailing). The model itself is not evaluated here.",
                "kH1_F1_full": {
                    "value": 42.2,
                    "page": 168,
                    "row": "A = 80, blank 380 (B = 150)"
                },
                "kH2_F2_full": {
                    "value": 28.9,
                    "page": 170,
                    "row": "blank 380, full nailing (18 nails in the header)"
                },
                "nJ_ef_1_full": {
                    "value": 10.7,
                    "page": 170,
                    "row": "blank 380, full nailing (12 nails in the joist)"
                },
                "nJ_ef_2_full": {
                    "value": 8.91,
                    "page": 170,
                    "row": "blank 380, full nailing"
                },
                "Ip_fl_full": {
                    "value": 8156,
                    "page": 170,
                    "row": "blank 380, full nailing (F3)"
                }
            },
            "values": {
                "datasheet_page": 3,
                "table": "Karakteristieke waarden - Dwarsbalk op balk - volledige vernageling (hout C24)",
                "kind": "R_k",
                "timber": "C24",
                "nailing": "full: 18 nails in the header, 12 in the joist",
                "R1": {
                    "4.0x35": 19.6,
                    "4.0x50": 28.7
                },
                "R2": {
                    "4.0x35": 12.5,
                    "4.0x50": 12.5
                },
                "R3": {
                    "4.0x35": 7.5,
                    "4.0x50": 11
                },
                "R4": {
                    "4.0x35": 7.3,
                    "4.0x50": 11.7
                }
            }
        }
    }
};
