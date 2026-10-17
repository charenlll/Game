"""Convert the approved Manyi V1.1 prose into stable, reviewable story beats.

The source document is kept in docs/ so generation does not depend on a Codex
attachment path. This is an initial-import tool. After release, preserve the
published beat IDs/text keys: edit locale values in place, and migrate saved
nodes explicitly before rebuilding a changed scene structure.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "docs/manyi-v1.1-source.md").read_text(encoding="utf-8")
chapter = source.split("## 7. 《满溢》V1.1完整剧情正文", 1)[1].split("### 信物说明", 1)[0]

segments = {
    "序幕：一枚不肯停下的铜钱": "opening",
    "第一场｜有钱难花": "battle1",
    "第二场｜越败越富": "battle2",
    "可选场景A｜未完货路": "optionalA",
    "第三场｜日落之铃": "battle3",
    "可选场景B｜空泊之位": "optionalB",
    "第四场｜归潮未归": "battle4",
    "可选场景C｜未结之账": "optionalC",
    "第五场｜最后一航": "battle5",
    "第六场｜满溢": "battle6",
    "终幕｜今日歇业": "ending",
    "尾声｜无名渡口": "epilogue",
}
encounters = {
    "battle1": "manyi-battle-1", "battle2": "manyi-battle-2",
    "battle3": "manyi-battle-3", "battle4": "manyi-battle-4",
    "battle5": "manyi-battle-5", "battle6": "manyi-battle-6",
    "optionalA": "manyi-optional-a", "optionalB": "manyi-optional-b",
    "optionalC": "manyi-optional-c",
}
default_scenes = {
    "opening": "ferry", "battle1": "street", "battle2": "ledger",
    "optionalA": "ledger", "battle3": "dock", "optionalB": "dock",
    "battle4": "dock", "optionalC": "ledger", "battle5": "ledger",
    "battle6": "dock", "ending": "dock", "epilogue": "ferry",
}
speaker_ids = {
    "绯川": "feichuan", "持盈": "chiying", "阿筹": "achou", "阿桅": "awei",
    "商人声音": "merchant_voice", "另一商人": "other_merchant",
    "船工声音": "worker_voice", "家属声音": "family_voice",
    "阿筹的记忆声音": "achou_memory",
}

groups = {key: [] for key in segments.values()}
texts = {}
encounter_notes = {key: [] for key in segments.values()}
group = None
scene = "ferry"
cast = ""
after_battle = False
counter = 0


def add_story(line: str) -> None:
    global counter
    line = line.strip()
    if not line or group is None:
        return
    speaker = "narrator"
    match = re.match(r"^\*\*(.+?)：\*\*\s*(.*)$", line)
    if match:
        speaker = speaker_ids.get(match.group(1), "narrator")
        line = match.group(2)
    line = line.replace("**", "").strip()
    if not line:
        return
    counter += 1
    key = f"manyi.{group}.{counter:04d}"
    texts[key] = line
    prop_id = None
    if speaker == "narrator":
        for keyword, identifier in (
            ("返航凭证", "PR1-03"), ("遇难者名单", "PR1-04"),
            ("货路簿", "PR1-02"), ("船灯", "PR1-05"),
            ("铜铃", "PR1-06"), ("铜钱从绯川手边滚落", "PR1-01"),
        ):
            if keyword in line:
                prop_id = identifier
                break
    groups[group].append({
        "id": f"manyi-{group}-{counter:04d}",
        "kind": "story", "textKey": key, "speakerId": speaker,
        "backgroundId": scene, "afterBattle": after_battle,
        **({"cast": cast} if cast else {}),
        **({"propId": prop_id} if prop_id else {}),
    })


for raw in chapter.splitlines():
    line = raw.strip()
    heading = re.match(r"^#{3,4}\s+(.+)$", line)
    if heading and heading.group(1) in segments:
        group = segments[heading.group(1)]
        scene = default_scenes[group]
        cast = ""
        after_battle = False
        continue
    if group is None or not line or line == "---":
        continue
    if line.startswith("场景："):
        # The story renderer retains the most recently specified scene until
        # a later explicit scene-change stage direction changes it.
        if "SC01" in line:
            scene = "street"
        elif "SC02" in line:
            scene = "ledger"
        elif "SC03" in line:
            scene = "dock"
        else:
            scene = "ferry"
        continue
    if line.startswith("出场："):
        cast = line.removeprefix("出场：")
        continue
    if line.startswith("战斗："):
        encounter_notes[group].append(line)
        continue
    battle = re.match(r"^\*\*战斗([①②③④⑤⑥])《(.+?)》\*\*$", line)
    if battle:
        groups[group].append({"id": f"manyi-{group}-encounter", "kind": "encounter", "encounterId": encounters[group], "backgroundId": scene})
        after_battle = True
        continue
    if line == "触发战斗。" or line == "商人因未能亏损而愤怒，触发执念战斗。":
        if line != "触发战斗。":
            add_story(line)
        groups[group].append({"id": f"manyi-{group}-encounter", "kind": "encounter", "encounterId": encounters[group], "backgroundId": scene})
        after_battle = True
        continue
    if line.startswith(("对抗：", "玩家作用：", "战后变化：")):
        encounter_notes[group].append(line)
        continue
    if group == "battle6" and line.startswith(("第一阶段：", "第二阶段：", "第三阶段：", "执念将", "所有事故责任", "商船不断", "玩家与绯川逐步")):
        encounter_notes[group].append(line)
        continue
    if line == "转场至长街。":
        add_story(line)
        scene = "street"
        continue
    if line.startswith("夜深后，持盈留下字条"):
        scene = "dock"
    if line.startswith("战后，") and group in ("optionalA", "optionalB", "optionalC") and not after_battle:
        groups[group].append({"id": f"manyi-{group}-encounter", "kind": "encounter", "encounterId": encounters[group], "backgroundId": scene})
        after_battle = True
    add_story(line)

# All nine battles must have an encounter marker. The optional battles use
# stage directions rather than the numbered combat label.
for name in encounters:
    assert sum(beat["kind"] == "encounter" for beat in groups[name]) == 1, name

out = ROOT / "src/data/chapters/manyi-beats.json"
out.write_text(json.dumps(groups, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "src/data/locales/manyi-zh-CN.json").write_text(json.dumps(texts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "src/data/chapters/manyi-encounter-notes.json").write_text(json.dumps(encounter_notes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated {sum(map(len, groups.values()))} beats, {len(texts)} text entries")
