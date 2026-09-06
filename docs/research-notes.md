# 調査メモ（要件定義の根拠）

調査日: 2026-09-06。要件定義書 `docs/requirements.md` の根拠となる事実と出所をまとめる。
「確認済み」は一次ソースまたは手元の実ファイルで確認したもの。「要検証」は確認できなかったもの。

---

## 1. `.miz` の構造（確認済み）

- `.miz` は通常の ZIP。手元 19 本はすべて次の 6 エントリ: `mission`、`options`、`warehouses`、`theatre`、`l10n/DEFAULT/dictionary`、`l10n/DEFAULT/mapResource`。
- `mission` は UTF-8 の Lua テーブル代入 `mission = { ... }`。ゲーム内では `env.mission` として同じ内容が見える。
  - Hoggit: https://wiki.hoggitworld.com/view/Miz_mission_structure
  - pydcs の読み書き実装: https://github.com/pydcs/dcs/blob/master/dcs/mission.py
- `theatre` はマップ名だけの短いテキスト（手元: `Caucasus` / `MarianaIslands`）。
- ニーボードやブリーフィング画像・スクリプト・音声は `l10n/DEFAULT/` と `KNEEBOARD/` に入る（`mapResource` が `ResKey_*` → ファイル名を対応づける）。
- pydcs は Lua VM を使わず、再帰下降パーサで読む: https://github.com/pydcs/dcs/blob/master/dcs/lua/parse.py

## 2. `mission` テーブルの主要キー（確認済み）

- トップレベル（手元の ME バージョン 23 で実測）: `coalition`, `coalitions`, `currentKey`, `date{Year,Month,Day}`, `descriptionText`, `descriptionBlueTask`, `descriptionRedTask`, `descriptionNeutralsTask`, `drawings`, `failures`, `forcedOptions`, `goals`, `groundControl`, `map`, `maxDictId`, `pictureFileNameB/R/N/Server`, `requiredModules`, `result`, `sortie`, `start_time`, `theatre`, `trig`, `triggers`, `trigrules`, `version`, `weather`。
- 文字列は `DictKey_*` で `l10n/DEFAULT/dictionary` を、`ResKey_*` で `mapResource` を参照する。
- `coalition.{blue,red,neutrals}` → `bullseye{x,y}`、`nav_points[]`、`country[]` → `plane|helicopter|ship|vehicle|static` → `group[]`。
- グループ: `groupId, name, x, y, frequency, modulation, communication, radioSet, hidden, hiddenOnMFD, hiddenOnPlanner, lateActivation, uncontrolled, start_time, task, route.points[]`。2026 年作成分ではグループ直下に `DTC = {}` もある。
  - https://github.com/pydcs/dcs/blob/master/dcs/unitgroup.py
- 経路点: `x, y, alt, alt_type("BARO"|"RADIO"), type, action, speed, ETA, ETA_locked, speed_locked, task(ComboTask), name, airdromeId, helipadId, linkUnit, properties, formation_template`。
  - `action` の例: "Turning Point", "Fly Over Point", "From Parking Area", "From Parking Area Hot", "From Runway", "Landing", "From Ground Area", "From Ground Area Hot", "Landing ReFu Ar"
  - https://github.com/pydcs/dcs/blob/master/dcs/point.py
- ユニット: `type, unitId, name, x, y, alt, alt_type, heading(ラジアン), psi, speed, skill{Average,Good,High,Excellent,Random,Player,Client}, callsign(整数 or {[1],[2],[3],name}), onboard_num, livery_id, payload{pylons{n:{CLSID}}, fuel, flare, chaff, gun}, AddPropAircraft, Radio, parking, parking_id, datalinks`。
  - https://github.com/pydcs/dcs/blob/master/dcs/flyingunit.py
- 手元で見た機種固有キー: F-15ESE の `AddPropAircraft` に `Sta2/5/8LaserCode`, `LCFTLaserCode`, `RCFTLaserCode`, `IFF_M2_CODE`, `MountNVG`, `SoloFlight`、`Radio[1].channels[1..20]`, `modulations`, `channelsNames`、`datalinks.Link16.settings.flightLead`、グループ直下の `NavTargetPoints[]{x,y,index,text_comment}`。F-15C の `AddPropAircraft` に `STN_L16`, `VoiceCallsignNumber`。
- トリガーゾーン: `zoneId, name, x, y, radius, type(0 円 / 2 多角形), verticies{n:{x,y}}, color{1..4 RGBA}, hidden, heading, linkUnit, properties`。
  - https://github.com/pydcs/dcs/blob/master/dcs/triggers.py
- 描画: `drawings.options.hiddenOnF10Map`、`drawings.layers[n]{name(Red/Blue/Neutral/Common/Author), visible, objects[n]}`。オブジェクト: `primitiveType(Line/Polygon/TextBox/Icon), polygonMode(circle/oval/rect/free/arrow), mapX, mapY, points, colorString, fillColorString("0xRRGGBBAA"), thickness, style, name, visible, layerName, radius, r1, r2, width, height, angle, length`。
  - https://github.com/pydcs/dcs/tree/master/dcs/drawing
- 天候: `wind.{atGround,at2000,at8000}.{speed,dir}`、`qnh`（mmHg）、`visibility.distance`（m）、`season.temperature`（°C）、`clouds{base,density,thickness,preset}`、`fog{thickness,visibility}`、`enable_fog`、`enable_dust`、`dust_density`、`groundTurbulence`、`atmosphere_type`、`type_weather`、`cyclones[]`。
  - https://github.com/pydcs/dcs/blob/master/dcs/weather.py

## 3. 単位・座標軸・風向（確認済み）

- ED 公式 FAQ: 「x は北、z は東、y は上」。`Vec2 = {x, y}` の `y` は `Vec3.z`（東）。ミッションファイルの `x` は北距、`y` は東距。
  - https://www.digitalcombatsimulator.com/en/support/faq/1256/
- 距離 m、速度 m/s（手元: 138.888… = 500 km/h）、高度 m、時間は秒。`start_time` は 0 時からの秒（手元: 28800 = 08:00）。
- 風向: ファイルの `dir` は「吹いていく方向」。表示は `(dir + 180) % 360` を FROM として出す。
  - DCS-real-weather のコード注記: https://github.com/evogelsa/DCS-real-weather/blob/main/miz/mission.go
  - ED フォーラム: https://forum.dcs.world/topic/226520-wind-direction/ 、https://forum.dcs.world/topic/385960-mission-editor-wrong-wind-direction/
- QNH は mmHg（手元: 763.778 = 1018.3 hPa = 30.07 inHg）。pydcs の既定値 760。

## 4. 座標変換（確認済み）

- pydcs は横メルカトル投影で proj 文字列を組む: `+proj=tmerc +lat_0=0 +lon_0={central_meridian} +k_0={scale_factor} +x_0={false_easting} +y_0={false_northing} +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +axis=neu`。
  - https://github.com/pydcs/dcs/blob/master/dcs/terrain/projections/transversemercator.py
- パラメータ（pydcs master、2026-09-06 取得）:
  - Caucasus: `central_meridian=33, false_easting=-99516.9999999732, false_northing=-4998114.999999984, scale_factor=0.9996`
  - MarianaIslands: `central_meridian=147, false_easting=238417.99999989968, false_northing=-1491840.000000048, scale_factor=0.9996`
  - Syria: `central_meridian=39, false_easting=282801.00000003993, false_northing=-3879865.9999999935, scale_factor=0.9996`
  - https://github.com/pydcs/dcs/blob/master/dcs/terrain/caucasus/projection.py
- 手元検証（pyproj 3.7.2）:
  - Caucasus 原点 (0, 0) → N45°07.770′ E34°15.931′（45.12950, 34.26552）
  - Marianas 原点 (0, 0) → N13°29.100′ E144°47.852′（グアム島内）
  - Marianas COOP ミッションの最初の Client 経路点（駐機）→ N14°10.368′ E145°14.623′（ロタ島の空港付近と推定）
  - ME の座標表示との照合は Phase 0 の作業。
- Caucasus の `airdromeId = 29` は pydcs の `Tbilisi_Lochini`（`atc_radio` に HF/VHF/UHF の周波数あり、`tacan = None`）。
- DCS Web Editor の投影方式は公開リポジトリが無く要検証。

## 5. JavaScript / TypeScript ライブラリ（確認済み）

- `luaparse`（MIT、AST）: npm 0.3.1 は 2021-06、最終コミット 2022-05。更新は止まっているが Lua 5.1〜5.3 の構文は安定。https://github.com/fstirlitz/luaparse
- `fengari`（Lua 5.3 VM）0.1.5（2025-12）、`wasmoon`（Lua 5.4 WASM）1.16.0（2026-04）。VM 実行は不要な攻撃面を増やすため不採用。
- `lua-json` 1.0.1（2022-09）: luaparse ラッパー。https://github.com/kcwiki/lua-json
- DCS 向け既存 TS: `Ked57/dcs-mission-parser`（Apache-2.0、アーカイブ済み）、`@flying-dice/tslua-dcs-mission-types`（型定義、2025-03）https://github.com/flying-dice/tslua-dcs
- ZIP: `fflate` 0.8.3（2026-05、Worker 対応、8〜12 kB gz）https://github.com/101arrowz/fflate 。JSZip 3.10.1 は 2022-08 が最終。
- 天文: `suncalc` 2.0.2（BSD-2、2026-09-02）https://github.com/mourner/suncalc
- 磁気偏差: `geomagnetism` 0.2.0（Apache-2.0、複数 WMM epoch を日付で自動選択。WMM2025 対応は要検証）https://github.com/naturalatlas/geomagnetism 、`geomag` 1.0.0（MIT、WMM2020）

## 6. `warehouses`（確認済み）

- `airports = { [airbaseId] = {...} }`、`warehouses = { [unitId] = {...} }`。各要素に `coalition`（手元: `"NEUTRAL"` など大文字。Hoggit の例は小文字。大文字小文字を無視して読む）、`unlimitedMunitions/Fuel/Aircrafts`、`dynamicSpawn`、`allowHotStart`、燃料種別ごとの `InitFuel` など。
  - https://wiki.hoggitworld.com/view/Miz_warehouses_structure
- `airports` のキーは経路点の `airdromeId` と同じ ID 体系。

## 7. ニーボード（一部要検証）

- `.miz` 内: `KNEEBOARD/IMAGES/` は全機共通、`KNEEBOARD/<機種ID>/IMAGES/`（例 `FA-18C_hornet`, `F-16C_50`, `A-10C_2`）は機種別。pydcs も `KNEEBOARD/{unit_type.id}/IMAGES/` に書く。
  - https://forum.dcs.world/topic/218200-adding-a-mission-specific-kneeboard-for-all-aircraft/
  - https://openkneeboard.com/features/dcs/
- Saved Games 側: `Saved Games/DCS/Kneeboard/`（全機）と `Kneeboard/<機種ID>/`。`IMAGES` サブフォルダの要否は資料で食い違う（要検証）。
  - https://github.com/SlipHavoc/DCS-Kneeboards
  - https://forum.dcs.world/topic/367919-does-anyone-know-where-i-should-place-my-custom-kneeboard-now/
- 形式は PNG / JPG。縦横比 3:4（幅:高さ）。具体的なピクセル数（768×1024、1536×2048 など）は公式の根拠が見つからず要検証。ページはファイル名順。
  - https://www.airgoons.com/w/Kneeboards

## 8. 既存ツール（確認済み、2026-09-06 時点）

| ツール | 形態 | できること | 備考 |
|---|---|---|---|
| CombatFlite | Windows デスクトップ、フリーウェア | `.miz` 取り込み、ニーボード出力（`.miz` 埋め込み / PNG）、ブリーフィング文書、データカード、CMDS Lua | 開発状況の記載なし。https://www.combatflite.com/ |
| DCS Web Editor / Viewer | ブラウザ | ミッション編集・閲覧、ニーボード生成、DTC 入出力 | OSS 化を告知したリポジトリは 404。実質クローズド。https://github.com/DCS-Web-Editor |
| Combined Ops | Web、無料 | `.miz` → ATO / ACO / SPINS / 通信計画 PDF、純正 `.dtc` 出力（F-16C, F/A-18C, F-14B, AH-64D） | クローズド。https://www.combinedops.org/ |
| DCS MDC Builder | Web、無料 | CombatFlite / `.miz` / JSON → PDF・PNG カード | https://dcs-mdc.com/ |
| MissionPlot | Windows、有料 | `.miz` 取り込み、DCS-DTC と純正 DTC 出力 | https://www.missionplot.com/ |
| DCS Mission Briefing Reader | Windows、無料 | `.miz` のブリーフィング文・画像・ニーボードを閲覧 | https://files.digitalcombatsimulator.com/en/files/3348532/ |
| DCS-DTC（the-paid-actor） | C#、GPL-3.0、v9.3.4（2026-07） | JSON プリセットをキー入力で機体に流し込む。F-16, F/A-18, F-15E, AH-64D, A-10C II, C-130J, CH-47F, AV-8B | https://github.com/the-paid-actor/dcs-dtc |
| OpenKneeboard | C++、独自ライセンス | VR オーバーレイ。Saved Games と `.miz` 内のニーボードを読む | https://openkneeboard.com/ |
| DCS Scratchpad | Lua、MIT | 機内メモ。F10 座標の挿入 | https://github.com/rkusa/dcs-scratchpad |
| BriefingRoom / DCS Retribution | 生成器（GPL-3.0 / LGPL-3.0） | ニーボード描画コードの参考になる | 読み取りツールではない |

## 9. DCS 純正 DTC（一部要検証）

- 2025-04-11 に導入告知。初期は F-16C と F/A-18C の COMM と対抗手段。https://www.digitalcombatsimulator.com/en/news/2025-04-11/
- ME で作成し、保存すると `.miz` 内に格納。File メニューで `.dtc` の入出力。https://forum.dcs.world/topic/371995-quick-start-guide-data-transfer-cartridge-dtc/
- 手元の実ファイルでは航空機グループ直下の `["DTC"] = {}` として存在（内容は空）。内容がある場合の形式は要検証。
- 2026-05 更新で Viper の Geo Lines / Threat Points、Hornet の SA パーティションが追加。https://forum.dcs.world/topic/388427-dtc-update-may-2026/
- 純正 `.dtc` を出力する第三者: Combined Ops、MissionPlot。

## 10. 機種別の座標形式（一部要検証）

| 機種 | 入力形式 | 出所 |
|---|---|---|
| F/A-18C | DD°MM.MM′（既定）、DD°MM′SS.ss″（precise / JDAM） | https://forum.dcs.world/topic/208503-discrepency-in-coordinate-systems/ |
| F-16C | DD°MM.mmm′ | 同上スレッドの JTAC 資料 |
| M-2000C | DD°MM.mm′ | 同上 |
| AH-64D | MGRS 8 桁が既定、L/L は DD MM.MM | https://www.gamepressure.com/digital-combat-simulator-ah-64d/navigation-and-map-points/z1fa91 |
| Ka-50 | PVI-800 は度・分.分、ABRIS は DMS | https://forum.dcs.world/topic/84432-pvi-800-programming/ |
| JF-17 | DD MM SS.SS | https://www.yumpu.com/en/document/view/63236937/dcs-jf-17-thunder-guide |
| AV-8B | DDM（3 桁）または DMS（1 桁） | 要検証 |
| A-10C II | DD MM.mmm と MGRS | 要検証 |
| F-15E | DDM / DMS、UTM / MGRS | 要検証 |

- F10 マップの表示形式は LAlt+Y で切替。DCS に十進度表示は無い。https://flyandwire.com/2020/08/10/back-to-basics-latitude-and-longitude-dms-dd-ddm/

## 11. 雲プリセットと QNH（確認済み）

- キーは `Preset1`〜`Preset27`、`RainyPreset1`〜`3`。表示名と雲底の範囲は pydcs `dcs/cloud_presets.py` にある。https://raw.githubusercontent.com/pydcs/dcs/master/dcs/cloud_presets.py
- 新しい DCS では `RainyPreset4`〜`6`、`NEWRAINPRESET4` があるという記述あり（DCS-real-weather）。実機で確認する。
- プリセットの見た目: https://forum.dcs.world/topic/268275-what-the-different-cloud-presets-look-like/

## 12. ブリーフィングの慣行（参考）

- 実機由来の流れ（Mudspike）: Admin → Tac Admin → Tactical → Contingencies。https://forums.mudspike.com/t/combat-flight-briefing/2953
- SMEAC 形式の文書例（Master Arms wiki）。https://wiki.masterarms.se/index.php/Mission_Design_Guide
- ミッション作成者向けテンプレート（ED フォーラム）。https://forum.dcs.world/topic/146835-mission-brief-templates-or-tips/

## 13. 参照データとライセンス（確認済み、一部要検証）

- pydcs: LGPL-3.0。PyPI は 0.15.0（2023）で古く、`master` が「DCS 2.29 export」（2026-09-04）まで更新中。`master` を使う。
  - 生成データ: `dcs/weapons_data.py`（CLSID → 名前・重量）、`dcs/planes.py` `helicopters.py`（燃料・速度・チャフ / フレア・パイロン）、`dcs/vehicles.py` `ships.py`（`detection_range`, `threat_range`, `air_weapon_dist`）、`dcs/countries.py`（コールサイン表）、`dcs/terrain/<map>/airports.py`（ID・名前・位置・滑走路・ATC 周波数。標高・ICAO・ビーコン周波数は無し）、`dcs/terrain/<map>/projection.py`。
  - 生成手段: `tools/pydcs_export.lua`（ME に読み込ませて出力）、`tools/airport_import.py`、`tools/export_map_projection.py`。
  - 収録マップ（master）: caucasus, nevada, normandy, persiangulf, thechannel, syria, marianaislands, falklands, sinai, kola, germany。Afghanistan と Iraq は無い。fork の dcs-retribution/pydcs（`retribution` ブランチ、LGPL-3.0）が afghanistan, iraq, germanycoldwar を追加。
- DCS Web Editor の deploy リポジトリ: `Airodromes.json`（ICAO、緯度経度、標高、滑走路、ビーコン）、`Beacons.json`（TACAN / VOR / ILS、周波数、チャンネル、位置）。ライセンス表記なし。https://github.com/DCS-Web-Editor/dcs-web-viewer-deploy
- dcs-retribution: `resources/dcs/beacons/<map>.json`（LGPL-3.0、座標なし）、`resources/theaters/<name>/info.yaml`（timezone）。https://github.com/dcs-retribution/dcs-retribution
- Quaggles/dcs-lua-datamine: DCS 内部テーブルの Lua ダンプ。ライセンス表記なし。https://github.com/Quaggles/dcs-lua-datamine
- 脅威半径: pydcs の `threat_range` / `detection_range` が最も扱いやすい。Hoggit Threat Database はライセンス表記なし。https://wiki.hoggitworld.com/view/Threat_Database
- ED EULA: 逆コンパイル・派生物の禁止条項はあるが、抽出した参照データ（座標・周波数・射程）に触れる条項は無い。ED による可否の声明は見つからず要検証。既存 OSS（pydcs、Retribution、BriefingRoom など）は長年公開している。ED の Lua や画像そのものは同梱しない方針にする。https://www.digitalcombatsimulator.com/en/support/license/

## 14. 磁気偏差（確認済み）

- DCS は `DCS World/Data/MagVar/` を用いて位置とミッション日付ごとに偏差を計算する（Batumi E6.0 / Anapa E6.5 など）。
  - https://forum.dcs.world/topic/202361-magnetic-declination-how-does-dcs-handle-it/
  - https://forum.dcs.world/topic/286102-magnetic-declination-update/
  - 実測表: https://flyandwire.com/2020/06/29/earth-magnetic-field-part-ii-magvar-reference-table/
- BriefingRoom の固定値は精度と符号が怪しいので採用しない。WMM を JS で計算する。

## 15. マップの UTC オフセット（一部要検証）

- pydcs `Terrain.utc_offset`: Caucasus +4、Nevada −8、Persian Gulf +4、Normandy 0、The Channel +2、Syria +3、Marianas +10、Falklands −3、Sinai +2、Kola +3、GermanyCW +2。
- Retribution `info.yaml`: 上記と同じ。加えて Afghanistan +4.5、Iraq +3。ただし GermanyCW は +1 で食い違う（要検証）。
- オフセットは太陽時ではなくマップごとの固定値。https://forum.dcs.world/topic/348984-map-time-zone-in-mission-editor/

## 16. 地図タイル（確認済み）

- OpenStreetMap: キー不要だが User-Agent / 帰属表示 / 7 日以上のキャッシュ / 大量取得禁止。https://operations.osmfoundation.org/policies/tiles/
- OpenTopoMap: CC-BY-SA 3.0、帰属表示。https://wiki.openstreetmap.org/wiki/OpenTopoMap
- OpenFreeMap: キー不要、制限なし、商用可、OSM 帰属表示（ベクタ、MapLibre 向け）。https://openfreemap.org/
- Esri World Imagery: 開発者アカウントと条件付き。キー無しの旧エンドポイントは規約上要検証。https://wiki.openstreetmap.org/wiki/Esri
- MapTiler: API キー必須、無料枠あり。https://www.maptiler.com/cloud/pricing/

## 17. 手元ミッションの実測サマリー

- 場所: `<HOME>/Saved Games/DCS/Missions/`（19 本）。
- Caucasus 5 本、Marianas 14 本。ME バージョン 23。
- Client スロット 1〜60 機、Player は 1 本。
- 機種: F-15ESE, FA-18C_hornet, F-16C_50, F-14A-135-GR(-Early), F-14B, F-4E-45MC, A-10C_2, AV8BNA, AH-64D_BLK_II, Ka-50_3, JF-17, M-2000C, UH-1H, Mi-24P, F-5E-3, C-130J-30, F-15C。
- 敵地上: S_75M_Volhov / SNR_75V（SA-2）、Kub（SA-6）、p-19 s-125 sr（SA-3 レーダー）、Hawk 一式、NASAMS 一式、Strela-1、ZSU-23-4、Stinger など。
- 経路点タスク: `EngageTargets`、`WrappedAction`（`Option`）、`Bombing`、`Orbit`、`AWACS`。`Tanker`、`ActivateBeacon`、`ActivateICLS`、`ActivateLink4` は無し。
- 3 本で `drawings` 使用、全本で `triggers.zones` 使用、2 本で多角形ゾーン。
- ニーボード・画像の埋め込みは無し。
