# Second Chance local fonts

These five Korean font families are bundled locally so the game and Adventure Editor do not depend on a remote font CDN. Each family comes from the official Google Fonts repository's `ofl/` directory and has its original `OFL.txt` and `METADATA.pb` alongside the font file.

| Family | Local file | Suggested use | Official source |
| --- | --- | --- | --- |
| IBM Plex Sans KR | `ibmplexsanskr/IBMPlexSansKR-Regular.ttf` | Game and editor UI, technical labels | https://github.com/google/fonts/tree/main/ofl/ibmplexsanskr |
| Noto Sans KR | `notosanskr/NotoSansKR[wght].ttf` | Long body text, dense information | https://github.com/google/fonts/tree/main/ofl/notosanskr |
| Gowun Batang | `gowunbatang/GowunBatang-Regular.ttf` | Recovered records, narration | https://github.com/google/fonts/tree/main/ofl/gowunbatang |
| Black Han Sans | `blackhansans/BlackHanSans-Regular.ttf` | Short, forceful titles only | https://github.com/google/fonts/tree/main/ofl/blackhansans |
| Do Hyeon | `dohyeon/DoHyeon-Regular.ttf` | Stage titles and short labels | https://github.com/google/fonts/tree/main/ofl/dohyeon |

All five use the SIL Open Font License 1.1. Commercial game use and bundling are permitted, subject to that license. They are **not public-domain or copyright-free**. Keep the corresponding `OFL.txt` with each distributed font; the license also has conditions on modified fonts and reserved font names. The binaries here are unmodified. Google Fonts also states that its open-source fonts may be used in commercial projects: https://developers.google.com/fonts

`font-families.css` registers the local files. The normal game/editor interface uses IBM Plex Sans KR; Adventure Editor dialogue settings can select any of the five families. Existing `default`, `serif`, and `mono` stage values remain valid.
