# Game design — prototype 0.1

## Intent

Begin with an ordinary afternoon in Tivon, let a café conversation lead into a sociable evening, then turn that familiar landscape into an archaeological mystery. The central theme is preservation: the final task is to restore a guardian's understanding of his duty and release him, rather than destroy him.

The full brief remains the long-term direction. This first implementation uses a condensed story, procedural scenery and lightweight systems so its interactions can be exercised before investing in finished assets. “Complete prototype story” and “complete production game” are different milestones.

## Narrative and interaction sequence

| Chapter | Player activity | Progression condition |
|---|---|---|
| A Night in Tivon | Explore the town; meet the Amali barista; receive beans and a clue | Explicit barista conversation |
| Coffee tutorial | Brew at café equipment, then drink from inventory | Completed brew and separate consumption action |
| Mandu | Enter a populated bar, participate in the evening and talk to the storyteller | Coffee tutorial complete; intoxication threshold plus active conversation |
| Equipment | Visit the user-identified computer shop at HaBonim 2 | Mandu clue unlocked; pay for flashlight and batteries |
| The Forgotten Catacombs | Reach the caves on foot; examine chambers and inscriptions | Equipment acquired; interact with entrance |
| The hidden annex | Gather inscriptions, reveal a light mark, join map fragments and use the mechanism | All evidence and correct mechanism sequence |
| The Last Guardian | Investigate the journal, survive the initial encounter, recover three memories | Ordered encounter and memory progression |
| The final oath | Restore the meaning of protection; discover the valley archive | Memory reveal and final sequence |
| Sunrise | Reach the overlook and return to the modern town | Spirit freed and archive discovered |

The quest model uses stable IDs, prerequisites, objectives, completion conditions, reward text and interaction triggers. Dialogues provide context-dependent options. Advancing a numerical meter does not by itself finish an interpersonal quest.

## Resources and recovery

- **Wakefulness:** 0–100, separate from intoxication. Movement slows at low wakefulness. Prepared coffee restores 32 points in the initial balance.
- **Coffee:** beans → equipped brewing station → timed preparation → carried coffee → drinking. Each step is distinct. No eating beans or brewing at arbitrary locations.
- **Intoxication:** used for the Mandu conversation, then decays. Camera motion remains slight and can be disabled through reduced-motion settings. Travel is on foot.
- **Money and shops:** purchases atomically deduct funds and add items; duplicate permanent equipment is blocked. Optional purchases reserve the money needed for the mandatory kit. Recovery dialogue prevents the story from becoming impossible through spending or sobering up.
- **Flashlight:** permanent inventory equipment; a charged battery is consumed over time when lit. Replacement uses a spare battery. The renderer must produce a directional light, not merely a HUD icon.
- **Save state:** versioned local data preserves resources, dialogue, position and puzzle flags. Invalid data is sanitized or rejected rather than trusted blindly.

All prices, inventory stock and consumable balance are fictional game rules, not real business offerings.

## World and presentation

The prototype links enterable Amali, Mandu and the electronics shop through a continuous compact town and footpath. Regional cues include Hebrew signage, limestone-colored walls, Mediterranean trees, street furniture, solar-water-heater forms and hilly terrain. Mandu uses a crowd with multiple poses/animation phases, warm lighting and original synthesized ambience.

The underground setting uses interconnected rooms and observational clues. The deeper annex is explicitly fictional. A simplified horseman landmark provides early context without making the entity's identity an early quest reward.

Hebrew is the default interface language with right-to-left panels and English equivalents. The HUD exposes resources and nearby interactions; the objective is available through the journal. The map is a schematic aid, not a route arrow or an accurate map of the real town/caves.

## Historical and geographical boundaries

Primary sources support Beit She'arim's ancient catacombs and inscriptions, its association with Rabbi Judah the Patriarch, and Alexander Zeid's watchman/Hashomer connections and local memorial. The research register specifies the evidence and its limits.

The ghost, curse, hidden network, puzzle inscriptions, personal letter, lantern, imagined photograph and valley archive are inventions. They must never be presented as recovered historical artifacts. Real staff members are not portrayed, and venue dialogue is fictional.

The user-confirmed computer-shop link identifies בית התוכנה והמחשב at **HaBonim 2**, superseding the brief's uncertain street description. Exact façades, interiors, road geometry and terrain are not yet reproduced from measured data. See [LOCATION_REFERENCES.md](docs/LOCATION_REFERENCES.md).

## Production work beyond this prototype

Photorealistic buildings and character assets, surveyed/compressed geography, richer archaeological investigation, expanded encounter choreography, authored music and voices, accessibility review, streaming/LOD, more expressive NPC behavior and qualified mobile support remain separate production tasks. They should follow tested gameplay improvements rather than obscure unfinished mechanics.
