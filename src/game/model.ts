/** Pure, serializable gameplay. Every invented archaeological device is identified in its text. */
import { LANDMARKS } from './landmarks';
export type Lang = 'he' | 'en';
export type Text = { he: string; en: string };
export const tx = (he: string, en: string): Text => ({ he, en });
export interface GameState {
  version: 1;
  phase: 1 | 2 | 3 | 4;
  money: number;
  wakefulness: number;
  intoxication: number;
  battery: number;
  flashlightOn: boolean;
  inventory: Record<string, number>;
  flags: Record<string, boolean>;
  journal: string[];
  history: Text[];
  position: { x: number; y: number; z: number; yaw: number; pitch: number };
  elapsed: number;
  brewing: number;
  encounter: { active: boolean; timer: number; hits: number; memories: number; survived: boolean };
  /** Map layout the position belongs to (2 = OSM-based town). Older saves are re-spawned in town. */
  world?: number;
}
export interface CatacombStep { id: string; done: boolean; label: Text; hint: Text }
export interface DialogueOption { label: Text; action: string; disabled?: boolean }
export interface Dialogue { title: Text; text: Text; options: DialogueOption[] }
export interface Quest {
  id: string; title: Text; description: Text; prerequisites: string[];
  objectives: Text[]; completion: (state: GameState) => boolean; rewards: Text; triggers: string[];
}
export const SAVE_KEY = 'tivon.last-guardian.save.v1';
export const items: Record<string, { name: Text; description: Text }> = {
  coffee_beans: { name: tx('פולי קפה', 'Coffee beans'), description: tx('משאב לחליטה בעמדת קפה. לא אוכלים את הפולים.', 'A brewing resource. Use equipment at a coffee station; beans cannot be eaten.') },
  coffee: { name: tx('קפה מוכן', 'Brewed coffee'), description: tx('כוס לדרך. שתייה מחזירה 32 נקודות ערנות.', 'A cup for the road. Drinking restores 32 wakefulness.') },
  flashlight: { name: tx('פנס', 'Flashlight'), description: tx('F להדלקה וכיבוי. סוללה מחזיקה כ־25 דקות.', 'F toggles the light. A full battery lasts about 25 minutes.') },
  batteries: { name: tx('סוללות חלופיות', 'Spare batteries'), description: tx('החלפה ממלאת את סוללת הפנס. ניתן להחליף במלאי.', 'Replace the flashlight battery from inventory to restore its charge.') },
  amali_note: { name: tx('פתק מעמלי', 'The Amali note'), description: tx('״מי ששאל על המערות אמר שיהיה במנדו בערב.״ דיאלוג בדיוני.', '“The person asking about caves said they would be at Mandu tonight.” Fictional dialogue.') },
  cave_note: { name: tx('הסיפור ממנדו', 'The Mandu story'), description: tx('פרסות מתחת לאדמה. צריך פנס וסוללות מבית התוכנה והמחשב, הבונים 2. הציוד ועלילת החנות בדיוניים.', 'Hoofbeats underground. Bring a flashlight and batteries from Beit HaTochna VeHaMachshev, HaBonim 2. The shop’s equipment and story events are fictional.') },
  inscription_notes: { name: tx('רישומי חקירה', 'Inscription notes'), description: tx('שלוש כתובות משחק בדיוניות: אור, שורש, מים. אלו אינן תעתיקים ארכאולוגיים.', 'Three fictional puzzle inscriptions: light, root, water. These are not archaeological transcriptions.') },
  map_fragment: { name: tx('קטע ממפה', 'Map fragment'), description: tx('שרטוט של חוקר בדיוני. שני החצאים מצביעים על אגף נסתר.', 'A fictional explorer’s sketch. Two halves locate the hidden annex.') },
  cave_map: { name: tx('מפת האגף', 'Annex map'), description: tx('מפת משחק סכמטית, לא מפה של אתר העתיקות האמיתי.', 'A schematic gameplay map, not a map of the real archaeological site.') },
  explorer_note: { name: tx('יומן החוקר', 'Explorer’s journal'), description: tx('יומן בדיוני: השומר אינו שומר על זהב. הוא שכח למען מי נשבע.', 'Fictional journal: the guardian does not watch over gold. He has forgotten for whom he made his oath.') },
  memory_lantern: { name: tx('פנס השומר', 'Watchman’s lantern'), description: tx('חפץ בדיוני. האור נועד לאנשים שהולכים הביתה, לא למלחמה.', 'An invented story object. Its light was for people finding their way home, not for war.') },
  memory_photo: { name: tx('תמונה מדומיינת', 'Imagined photograph'), description: tx('חפץ בדיוני המסמל את הקשר לעמק. אינו תצלום ארכיוני אמיתי.', 'An invented representation of a connection to the valley. This is not an actual archival photograph.') },
  memory_letter: { name: tx('מכתב שלא נשלח', 'Unsent letter'), description: tx('מכתב בדיוני: ״שמרו את הזיכרון, כדי שאוכל להניח לשמירה.״', 'An invented letter: “Keep the memory, so that I may set down the watch.”') },
  valley_archive: { name: tx('ארכיון העמק', 'Valley archive'), description: tx('האוצר הבדיוני: סיפורים, שמות וזיכרונות של קהילה. יש לשמרו, לא למכור אותו.', 'The fictional treasure: a community’s stories, names, and memories. To be preserved, not sold.') },
};
/** Shop keepers of the walk-in interiors (ids `keeper_<shop>`): a friendly line, then a second one on request.
 *  Shops are game approximations and the people are fictional. `keys` match the id loosely so any shop id works. */
interface KeeperTalk { keys: string[]; title: Text; lines: [Text, Text] }
const KEEPERS: KeeperTalk[] = [
  { keys: ['barista'], title: tx('אווה ובתיה · בריסטה', 'Eva & Batya · Barista'), lines: [tx('״אספרסו? הפוך? תשבו, הסרט רק מתחיל בעוד חצי שעה.״', '“Espresso? A flat white? Sit down, the film only starts in half an hour.”'), tx('״הקרואסון הזה יצא מהתנור לפני עשר דקות. אל תגידו לאף אחד.״', '“That croissant came out of the oven ten minutes ago. Don’t tell anyone.”')] },
  { keys: ['cinema', 'zohar'], title: tx('קופה · קולנוע זוהר', 'Ticket desk · Zohar Cinema'), lines: [tx('״כרטיס אחד? יש מקומות טובים באמצע. פופקורן נמכר ליד, אצל הדוכן.״', '“One ticket? There are good seats in the middle. Popcorn is just over there.”'), tx('״אל תדאגו, אין פרסומות. רק חמישה טריילרים.״', '“Don’t worry, no adverts. Just five trailers.”')] },
  { keys: ['restaurant', 'butcher'], title: tx('בוצ׳ר טבעון', 'Butcher Tivon'), lines: [tx('״האנטריקוט היום יצא מדהים. בינוני? אני כבר יודע — אתם נראים כמו בינוני.״', '“The entrecôte is wonderful today. Medium? I can tell — you look like a medium.”'), tx('״הגריל דולק מהבוקר, השכנים כבר לא מתלוננים. הם אוכלים כאן.״', '“The grill has been on since morning, and the neighbours stopped complaining. They eat here now.”')] },
  { keys: ['print'], title: tx('דפוס והעתקות', 'Print & Copy'), lines: [tx('״צילום, הדפסה, כריכה? מה שצריך — רק תגידו כמה עותקים. ובלי פונט קומיק סאנס, בבקשה.״', '“Copies, prints, binding? Just say how many. And no Comic Sans, please.”'), tx('״הפלוטר הגדול בא עם מחיר — אבל הפוסטר יוצא כמו בסרטים.״', '“The big plotter isn’t cheap, but the poster comes out like in the movies.”')] },
  { keys: ['camera', 'itzik'], title: tx('ביתן הצילום של איציק', 'Itzik’s camera shop'), lines: [tx('״פילם? מצלמה דיגיטלית? אני עוד מפתח תמונות על נייר, כמו פעם.״', '“Film? Digital? I still print photos on paper, the old way.”'), tx('״העדשה הזאת? יש לה יותר היסטוריה ממני. וגם איכות.״', '“That lens? It has more history than I do. And better quality.”')] },
  { keys: ['pilates'], title: tx('סטודיו פילאטיס', 'Pilates Studio'), lines: [tx('״בואו בנעלי גרביים. נשימה עמוקה — וכל השרירים שלא ידעתם שיש לכם יתעוררו.״', '“Come in grip socks. Deep breath — and every muscle you didn’t know you had will wake up.”'), tx('״הרפורמר נראה כמו מכשיר עינויים. הוא לא. טוב, קצת.״', '“The reformer looks like a torture device. It isn’t. Well, a little.”')] },
  { keys: ['paint', 'tambor'], title: tx('חלק טמבור', 'Chelek Tambour'), lines: [tx('״צבע לסלון? תביאו דוגמה — נערבב לכם בדיוק את הגוון. לא נגיד ׳כמעט אותו דבר׳.״', '“Paint for the lounge? Bring a sample — we’ll mix the exact shade. We never say ‘almost the same’.”'), tx('״ברגים, ידיות, שפכטל, צבע — מי שלא מוצא אצלנו, כנראה לא צריך.״', '“Screws, handles, putty, paint — if you can’t find it here, you probably don’t need it.”')] },
  { keys: ['chocolate', 'mishi'], title: tx('מישי · בוטיק שוקולד', 'Mishi · Chocolate Boutique'), lines: [tx('״טעימה? פרלין מרציפן או חמוץ־מתוק עם פסיפלורה? בלי אשמה, זה קקאו.״', '“A taste? Marzipan praline or sweet-and-sour passion fruit? No guilt, it’s cocoa.”'), tx('״מארז מתנה? תגידו לי למי, ואני אבחר לפי האופי.״', '“A gift box? Tell me who it’s for, and I’ll choose by character.”')] },
  { keys: ['pharmacy'], title: tx('בית מרקחת', 'Pharmacy'), lines: [tx('״יש מרשם? תנו לי דקה. ועדיף לשתות מים, מה שזה לא יהיה.״', '“Got a prescription? Give me a minute. And drink some water, whatever it is.”'), tx('״לחץ הדם בפינה בחינם. תשבו, תרגעו — זה יעזור לתוצאה.״', '“The blood-pressure seat in the corner is free. Sit, relax — it helps the result.”')] },
  { keys: ['flower'], title: tx('חנות הפרחים', 'The Flower Shop'), lines: [tx('״זר לשבת? לאמא? לסליחה? תגידו לי את האירוע — אני אדע איזה פרח.״', '“A bouquet for Shabbat? For Mum? For an apology? Tell me the occasion and I’ll pick the flower.”'), tx('״הרקפות בעונה. אבל אל תקטפו בחוץ — זה אסור, והן יותר יפות בהר.״', '“Cyclamens are in season. But don’t pick them outside — it’s forbidden, and they’re prettier on the hill.”')] },
  { keys: ['alhakav', 'hakav', 'ravkav'], title: tx('על-הקו · מרכז שירות', 'Al HaKav · Service Centre'), lines: [tx('״רב־קו? טעינה, כרטיס אישי או עדכון פרופיל? קחו מספר, ואני איתכם.״', '“Rav-Kav? Top-up, a personal card or a profile update? Take a number and I’m with you.”'), tx('״כן, יש הנחה לסטודנטים ולאזרחים ותיקים — רק תביאו תעודה. והקו לחיפה כבר מגיע.״', '“Yes, there’s a discount for students and seniors — just bring ID. And the Haifa bus is almost here.”')] },
  { keys: ['chen'], title: tx('פלאפל חן', 'Falafel Chen'), lines: [tx('״שלושים שנה אותו מתכון. פיתה או לאפה? הסלטים חופשי.״', '“Thirty years, the same recipe. Pita or laffa? Salads are unlimited.”'), tx('״חם, טרי ובריא — ככה כתוב על השלט, וככה זה.״', '“Hot, fresh and healthy — that’s what the sign says, and that’s how it is.”')] },
  { keys: ['luli'], title: tx('פלאפל לולי', 'Falafel Luli'), lines: [tx('״טעם של פעם! בפיתה או במנה? אל תחסכו בעמבה.״', '“The taste of the old days! In a pita or a plate? Don’t hold back on the amba.”'), tx('״כל התמונות על הקיר? לקוחות קבועים. תחזרו מספיק פעמים ותגיעו לשם.״', '“All the photos on the wall? Regulars. Come back enough times and you’ll be up there.”')] },
  { keys: ['falafel'], title: tx('פלאפל', 'Falafel'), lines: [tx('״בפיתה או במנה? הכל חם, הסלטים חופשי. אל תחסכו בחריף — אני לא אספר לאמא שלכם.״', '“In a pita or a plate? Everything’s hot, salads are unlimited. Don’t skimp on the hot sauce — I won’t tell your mum.”'), tx('״הכדורים נוצרים מאפס כל שעה. פעם אחת ניסו לקנות ממני את המתכון. ניסו.״', '“The balls are made fresh every hour. Someone once tried to buy the recipe. Tried.”')] },
  { keys: ['pizza'], title: tx('פיצה', 'Pizza'), lines: [tx('״מרגריטה? יוצאת מהתנור בתשעים שניות. לא מוסיפים אננס, ותודה על ההבנה.״', '“A Margherita? Out of the oven in ninety seconds. No pineapple, and thanks for understanding.”'), tx('״האש הזאת בוערת מעצי זית מהעמק. הריח של העמק, בפרוסה.״', '“That fire burns valley olive wood. The scent of the valley, in a slice.”')] },
  { keys: ['barber', 'salim'], title: tx('מספרת סלים', 'Salim’s barbershop'), lines: [tx('״תספורת? זקן? שבו, תשתקו, ותספרו לי הכל. זה העסק שלנו.״', '“A haircut? A beard? Sit, relax and tell me everything. That’s our business.”'), tx('״מה שקורה בכיסא נשאר בכיסא. חוץ מהשיער, הוא על הרצפה.״', '“What happens in the chair stays in the chair. Except the hair — that’s on the floor.”')] },
  { keys: ['clocks', 'aurum'], title: tx('AURUM · שעונים', 'AURUM · Clocks'), lines: [tx('״כל השעונים כאן מראים שעה אחרת, ורק אחד נכון. תנחשו איזה.״', '“Every clock here shows a different time, and only one is right. Guess which.”'), tx('״שעון ישן אפשר להחיות. צריך סבלנות, שמן קטן ועין טובה.״', '“An old clock can be revived. It takes patience, a drop of oil and a good eye.”')] },
  { keys: ['chabad'], title: tx('בית חב״ד', 'Beit Chabad'), lines: [tx('״שלום וברכה! שבת שלום בקרוב — יש מקום לכולם סביב השולחן. תשתו משהו?״', '“Shalom and welcome! Shabbat is coming — there’s room for everyone at the table. Something to drink?”'), tx('״ספרים, שיעורים, סעודות, וכוס יין. אין צורך להזמין, רק להגיע.״', '“Books, classes, meals and a glass of wine. No need to book — just come.”')] },
  { keys: ['drugstore', 'junction'], title: tx('דראגסטור הצומת', 'Drugstore HaTzomet'), lines: [tx('״קולה קרה? חטיף? הלוטו נסגר בשמונה — אולי הפעם.״', '“A cold cola? A snack? The lottery closes at eight — maybe this time.”'), tx('״כספומט בפינה, והוא אוהב שטרות חדשים. אל תשאלו למה.״', '“The ATM’s in the corner, and it likes new notes. Don’t ask why.”')] },
];
const keeperFor = (id: string) => { const k = id.replace(/^keeper_/, '').toLowerCase(); return KEEPERS.find(t => t.keys.some(key => k.includes(key))); };
const KEEPER_FALLBACK: KeeperTalk = { keys: [], title: tx('בעל/ת החנות', 'The shopkeeper'), lines: [tx('״ברוכים הבאים! תסתכלו בנחת, ואם צריך משהו — אני כאן.״', '“Welcome! Take your time, and if you need anything — I’m right here.”'), tx('״בטבעון כולם מכירים את כולם. אתם כבר כמעט תושבים.״', '“In Tivon everyone knows everyone. You’re almost a local already.”')] };
const CHATTER: Text[] = [
  tx('שוב חזירי בר הפכו לי את הגינה. שלוש פעמים השבוע. מישהו מהמועצה קורא את הקבוצה בכלל?', 'Wild boars dug up my garden again. Third time this week. Does anyone at the council even read the group?'),
  tx('מי שמחנה כל בוקר על המדרכה ליד הכיכר — אני יודעת מי אתה. כולם יודעים.', 'Whoever parks on the pavement by the square every morning — I know who you are. Everyone knows.'),
  tx('מפוח עלים בשבע בבוקר. בשבת. אין לי מילים.', 'A leaf blower at seven in the morning. On Saturday. I have no words.'),
  tx('התנועה בצומת של 75 בשעה חמש זה כבר לא פקק, זה אורח חיים.', 'Route 75 junction traffic at five o\'clock isn\'t a jam anymore, it\'s a lifestyle.'),
  tx('שמעתם את התנים אתמול בלילה? חשבתי שיש מסיבה במנדו.', 'Did you hear the jackals last night? I thought there was a party at Mandu.'),
  tx('מישהו ראה חתול ג׳ינג׳י עם קולר כחול? נעלם מאזור הרקפות.', 'Has anyone seen a ginger cat with a blue collar? Went missing near HaRakafot.'),
  tx('למה כל עבודות הכביש באלונים מתחילות בדיוק כשמתחילה שנת הלימודים?', 'Why do all the roadworks on Alonim start exactly when the school year does?'),
  tx('בטבעון כל הליכה היא עלייה. גם הדרך חזרה. מדע לא מסביר את זה.', 'In Tivon every walk is uphill. Including the way back. Science can\'t explain it.'),
  tx('הקו לחיפה הגיע בזמן היום. צילמתי כהוכחה.', 'The bus to Haifa came on time today. I took a photo as proof.'),
  tx('מי שמשאיר את צרכי הכלב בשביל ליד הספרייה — יש שקיות, הן בחינם.', 'To whoever leaves their dog\'s mess on the path by the library — the bags are free.'),
  tx('כריתת עוד אורן בשכונה? ככה נגמרת לנו הטבעון של פעם.', 'Another pine cut down in the neighbourhood? That\'s how the old Tivon disappears.'),
  tx('הבוגנוויליה של השכנים חוסמת את כל המדרכה. אני הולכת על הכביש כבר שנה.', 'The neighbours\' bougainvillea blocks the whole pavement. I\'ve been walking in the road for a year.'),
  tx('ילדים על קורקינטים חשמליים במדרחוב. במהירות של רכבת.', 'Kids on electric scooters in the pedestrian street. At train speed.'),
  tx('התור בדואר היה ארוך יותר מהתור לגן הלאומי בפסח.', 'The queue at the post office was longer than the one for the national park at Passover.'),
  tx('וייז שולח את כל העמק דרך הרחוב שלי. שקט של קריית טבעון, אמרו.', 'Waze sends the whole valley down my street. Kiryat Tivon\'s quiet, they said.'),
  tx('מישהו יודע למה הייתה הפסקת חשמל בקריית עמל? המקרר שלי בוכה.', 'Does anyone know why the power went out in Kiryat Amal? My fridge is crying.'),
  tx('שאלה לקבוצה: יש עוד מישהו ששומע את הרכבת? אין פה רכבת.', 'Question for the group: does anyone else hear a train? There\'s no train here.'),
  tx('פחי המחזור הכתומים מלאים שבוע. אני ממחזרת בבית כבר, יש לי מגדל בקבוקים בסלון.', 'The orange recycling bins have been full for a week. I recycle at home now; there\'s a tower of bottles in my living room.'),
  tx('המוזיקה במנדו עד אחת בלילה — אבל בכנות, הייתה רשימת שירים טובה.', 'Music at Mandu until one in the morning — but honestly, the playlist was good.'),
  tx('עוד שכונה חדשה? ואיפה יחנו כולם? בכיכר?', 'Another new neighbourhood? And where will everyone park? In the square?'),
  tx('כמה עולה היום מנת פלאפל? אני זוכר כשזה היה בשקלים בודדים. אני גם זוכר דינוזאורים.', 'How much is a falafel now? I remember when it was a few shekels. I also remember dinosaurs.'),
  tx('האורנים פה מפזרים אבקה כאילו יש להם משהו נגדי אישית.', 'The pines here throw pollen like they have something against me personally.'),
  tx('בריכה פתוחה עד שש? מי שקבע את השעות לא עובד בכלל?', 'The pool open only until six? Did whoever set the hours never have a job?'),
  tx('ראיתי צבי בבוקר ליד מצפה שרון. אחר כך ראיתי חזיר. האיזון נשמר.', 'I saw a gazelle this morning near Mitzpe Sharon. Then I saw a boar. Balance restored.'),
  tx('למה הכיכר בכניסה צריכה עוד פסל? עדיף רמזור שעובד.', 'Why does the roundabout need another sculpture? I\'d rather have a working traffic light.'),
  tx('מי שלקח את הכיסא הלבן מליד הקיוסק — זה היה הכיסא של סבתא שלי. בערך.', 'Whoever took the white chair by the kiosk — it was my grandmother\'s chair. More or less.'),
  tx('הפיצה לא מגיעה לרחוב שלי כי ׳זה בעלייה׳. גם אני בעלייה, ואני מגיע.', 'The pizza place won\'t deliver to my street because \'it\'s uphill\'. I\'m uphill too, and I get there.'),
  tx('ממליצים על אינסטלטור בטבעון? אחד שעונה לטלפון זה בונוס.', 'Can anyone recommend a plumber in Tivon? One who answers the phone is a bonus.'),
  tx('תיקנו את המדרכה באלונים. שבוע אחר כך חפרו אותה שוב. מסורת יפה.', 'They fixed the pavement on Alonim. A week later they dug it up again. A lovely tradition.'),
  tx('הגשם הראשון — וכל הקבוצה מתווכחת אם זה טיפטוף או שיטפון.', 'First rain — and the whole group is arguing whether it\'s a drizzle or a flood.'),
  tx('יש פה מישהו שזוכר שבמגדל המים היו פעם מים? אני רק שואל.', 'Does anyone remember when the water tower actually had water in it? Just asking.'),
  tx('הרמזור ליד הספרייה ירוק לשנייה וחצי. אני רץ, ואני בן שבעים.', 'The light by the library stays green for a second and a half. I run, and I\'m seventy.'),
  tx('החנייה בגן הלאומי עולה כסף? אנחנו שכנים! זה כמו לשלם לסבתא על ארוחת שישי.', 'Parking at the national park costs money? We\'re neighbours! It\'s like paying grandma for Friday dinner.'),
  tx('מישהו איבד מפתחות עם מחזיק של רקפת ליד המדרחוב. הם אצלי במכולת.', 'Someone lost keys with a cyclamen keyring near the pedestrian street. They\'re with me at the grocery.'),
  tx('הקפה בעמלי? טוב. התור בעמלי? אה. שווה, אבל אה.', 'The coffee at Amali? Good. The queue at Amali? Ugh. Worth it, but ugh.'),
  tx('למה בשבת בבוקר כולם מחליטים לרכוב על אופניים בדיוק בכביש שלי?', 'Why on Saturday morning does everyone decide to cycle exactly on my road?'),
];
const f = (s: GameState, key: string) => s.flags[key] === true;
export const quests: Quest[] = [
  { id: 'amali', title: tx('קפה לפני הכול', 'Coffee comes first'), description: tx('בעמלי יש זמן לשיחה טובה ולכוס קפה.', 'Amali has time for a conversation and a cup of coffee.'), prerequisites: [], objectives: [tx('דברו עם הבריסטה בעמלי.', 'Speak to the barista at Amali.')], completion: s => f(s, 'amaliClue'), rewards: tx('פולים ופתק', 'Beans and a note'), triggers: ['barista'] },
  { id: 'brewing', title: tx('לא אוכלים פולים', 'Beans are for brewing'), description: tx('חלוטו קפה בעמדת החליטה, ואז שתו אותו מהמלאי.', 'Brew coffee at the station, then drink it from your inventory.'), prerequisites: ['amali'], objectives: [tx('חלוטו קפה בעמלי ושתו כוס מהמלאי.', 'Brew coffee at Amali and drink a cup from inventory.')], completion: s => f(s, 'coffeeDrunk'), rewards: tx('ערנות ודרך למנדו', 'Wakefulness and a lead to Mandu'), triggers: ['brewer'] },
  { id: 'mandu', title: tx('סיפורים אחרי החשכה', 'Stories after dark'), description: tx('מצאו את מנדו: במורד רחוב אלונים אל צומת קריית טבעון, בקומה השנייה באלכסנדר זייד 1. הזמינו שני משקאות ושוחחו עם המספר שליד הבר.', 'Find Mandu: down Alonim Street to the Kiryat Tivon junction, upstairs at 1 Alexander Zaid. Order two drinks and talk to the storyteller beside the bar.'), prerequisites: ['brewing'], objectives: [tx('לכו במורד רחוב אלונים לצומת קריית טבעון, רדו במדרגות הקצרות מהתחנה לרחבה העליונה ומשם למרפסת של מנדו. שם: שני משקאות, ואז שיחה עם המספר.', 'Walk down Alonim Street to the Kiryat Tivon junction, take the short stair from the bus stop down to the upper plaza and step onto Mandu’s balcony. There: two drinks, then talk to the storyteller.')], completion: s => f(s, 'manduClue'), rewards: tx('רמז למערות', 'A lead to the caves'), triggers: ['bartender', 'storyteller'] },
  { id: 'equipment', title: tx('אור לדרך', 'A light for the road'), description: tx('בגרסת המשחק של בית התוכנה והמחשב, הבונים 2, אפשר לקנות פנס וסוללות.', 'The game’s version of Beit HaTochna VeHaMachshev, HaBonim 2, has a flashlight and batteries.'), prerequisites: ['mandu'], objectives: [tx('קנו פנס וסוללות בבית התוכנה והמחשב (הבונים 2, מזרחית לצומת), ואז לכו דרומה ברגל לגן הלאומי בית שערים.', 'Buy a flashlight and batteries at Beit HaTochna VeHaMachshev (2 HaBonim, east of the junction), then walk south to Beit She’arim National Park.')], completion: s => f(s, 'cavesEntered'), rewards: tx('פרק שני', 'Chapter two'), triggers: ['shopkeeper', 'cave_entrance'] },
  { id: 'catacombs', title: tx('האבנים מדברות', 'The stones remember'), description: tx('חקרו שלוש כתובות, חפשו סימן בעזרת הפנס וחברו שני חלקי מפה.', 'Study three inscriptions, reveal a mark with the flashlight, and join two map fragments.'), prerequisites: ['equipment'], objectives: [tx('חקרו את שלושת החדרים ואת שני קטעי המפה.', 'Explore the three chambers and collect both map fragments.')], completion: s => f(s, 'inscriptionA') && f(s, 'inscriptionB') && f(s, 'inscriptionC') && f(s, 'lightRevealed') && f(s, 'mapA') && f(s, 'mapB'), rewards: tx('הסדר לפתיחת האגף', 'The annex sequence'), triggers: ['inscription_a', 'inscription_b', 'inscription_c', 'light_mark', 'map_a', 'map_b'] },
  { id: 'passage', title: tx('מאחורי האבן', 'Beyond the stone'), description: tx('הפעילו את מנגנון המשחק בסדר שלמדתם, ואז פתחו את המעבר.', 'Operate the fictional mechanism in the order you learned, then open the passage.'), prerequisites: ['catacombs'], objectives: [tx('אור, שורש, מים. בדקו את המעבר הנסתר.', 'Light, root, water. Examine the hidden passage.')], completion: s => f(s, 'hiddenOpened'), rewards: tx('פרק שלישי', 'Chapter three'), triggers: ['mechanism', 'hidden_gate'] },
  { id: 'watchman', title: tx('פרסות בחשכה', 'Hoofbeats in the dark'), description: tx('קראו את יומן החוקר. התקרבו לשומר והישארו בתנועה עד שההסתערות תחלוף.', 'Read the explorer’s journal. Approach the guardian and keep moving until the charge subsides.'), prerequisites: ['passage'], objectives: [tx('חקרו את האגף הבדיוני ושרדו את המפגש הראשון.', 'Investigate the fictional annex and survive the first encounter.')], completion: s => s.encounter.survived, rewards: tx('גישה לזיכרונות', 'Access to the memories'), triggers: ['explorer_note', 'guardian'] },
  { id: 'memories', title: tx('מי נשאר לשמור', 'Who kept the watch'), description: tx('מצאו פנס, תמונה ומכתב. שלושתם חפצי סיפור בדיוניים.', 'Find a lantern, a picture, and a letter. All three are invented story objects.'), prerequisites: ['watchman'], objectives: [tx('אספו את שלושת הזיכרונות והקשיבו למה שחסר בשבועה.', 'Recover all three memories and listen for what the oath has lost.')], completion: s => f(s, 'identityRevealed'), rewards: tx('זהותו של השומר', 'The guardian’s identity'), triggers: ['memory_lantern', 'memory_photo', 'memory_letter'] },
  { id: 'oath', title: tx('השבועה האחרונה', 'The final oath'), description: tx('הזכירו לשומר: האנשים, המקום, ואז הזיכרון.', 'Remind the guardian: the people, the place, then the memory.'), prerequisites: ['memories'], objectives: [tx('השלימו את השבועה כדי לשחרר, לא להשמיד.', 'Complete the oath to release, not destroy.')], completion: s => f(s, 'spiritFreed'), rewards: tx('שלום', 'Peace'), triggers: ['oath'] },
  { id: 'treasure', title: tx('מה שנשאר איתנו', 'What stays with us'), description: tx('פתחו את ארכיון העמק, ואז צאו אל תצפית הזריחה.', 'Open the valley archive, then walk to the sunrise overlook.'), prerequisites: ['oath'], objectives: [tx('גלו את האוצר והגיעו לתצפית.', 'Discover the treasure and reach the overlook.')], completion: s => f(s, 'ending'), rewards: tx('העמק ממשיך לחיות', 'The valley lives on'), triggers: ['treasure', 'overlook'] },
];

const initialState = (): GameState => ({
  version: 1, phase: 1, money: 160, wakefulness: 68, intoxication: 0, battery: 100, flashlightOn: false,
  inventory: {}, flags: {}, journal: [], history: [], position: { x: 0, y: 1.7, z: 12, yaw: 0, pitch: 0 },
  elapsed: 0, brewing: 0, encounter: { active: false, timer: 0, hits: 0, memories: 0, survived: false },
});
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
const validFlags = [
  'amaliClue', 'beansReceived', 'coffeeBrewed', 'coffeeDrunk', 'manduClue', 'suppliesBought', 'batteriesBought',
  'cavesEntered', 'inscriptionA', 'inscriptionB', 'inscriptionC', 'lightRevealed', 'mapA', 'mapB',
  'sequenceLamp', 'sequenceTree', 'mechanismSolved', 'hiddenOpened', 'explorerRead', 'guardianSeen',
  'firstConfrontationSurvived', 'identityRevealed', 'lanternFound', 'photoFound', 'letterFound',
  'oathPeople', 'oathPlace', 'spiritFreed', 'treasureFound', 'ending',
];
function normalize(raw: unknown): GameState | null {
  if (!record(raw) || raw.version !== 1 || !record(raw.position) || !record(raw.inventory) || !record(raw.flags) || !record(raw.encounter)) return null;
  const s = initialState();
  s.phase = [1, 2, 3, 4].includes(raw.phase as number) ? raw.phase as GameState['phase'] : 1;
  s.money = Math.floor(finite(raw.money, 160, 0, 100000));
  s.wakefulness = finite(raw.wakefulness, 68, 0, 100);
  s.intoxication = finite(raw.intoxication, 0, 0, 100);
  s.battery = finite(raw.battery, 100, 0, 100);
  s.elapsed = finite(raw.elapsed, 0, 0, 1e9);
  s.brewing = finite(raw.brewing, 0, 0, 3);
  for (const id of Object.keys(items)) {
    const amount = Math.floor(finite(raw.inventory[id], 0, 0, 999));
    if (typeof raw.inventory[id] === 'number' && Number.isFinite(raw.inventory[id]) && (raw.inventory[id] as number) >= 0) s.inventory[id] = amount;
  }
  for (const key of validFlags) if (typeof raw.flags[key] === 'boolean') s.flags[key] = raw.flags[key] as boolean;
  s.flashlightOn = raw.flashlightOn === true && (s.inventory.flashlight ?? 0) > 0 && s.battery > 0;
  s.position = {
    x: finite(raw.position.x, 0, -5000, 5000), y: finite(raw.position.y, 1.7, -500, 500), z: finite(raw.position.z, 12, -5000, 5000),
    yaw: finite(raw.position.yaw, 0, -1e6, 1e6), pitch: finite(raw.position.pitch, 0, -1.55, 1.55),
  };
  s.journal = Array.isArray(raw.journal) ? raw.journal.filter((x): x is string => typeof x === 'string' && x.length < 300).slice(-100) : [];
  s.history = Array.isArray(raw.history) ? raw.history.filter((x): x is Text => record(x) && typeof x.he === 'string' && typeof x.en === 'string' && x.he.length < 3000 && x.en.length < 3000).slice(-80) : [];
  s.encounter = {
    active: raw.encounter.active === true && s.phase === 3 && !s.flags.spiritFreed,
    timer: finite(raw.encounter.timer, 0, 0, 20), hits: Math.floor(finite(raw.encounter.hits, 0, 0, 1000)),
    memories: ['lanternFound', 'photoFound', 'letterFound'].filter(k => s.flags[k]).length,
    survived: raw.encounter.survived === true,
  };
  if (s.encounter.survived) s.encounter.active = false;
  if (typeof raw.world === 'number') s.world = raw.world;
  return s;
}

export class GameModel {
  state: GameState;
  private context = '';
  private allowed = new Set<string>();
  private chats = new Map<string, number>();
  constructor(state?: GameState) { this.state = state ? normalize(state) ?? initialState() : initialState(); }
  private has(id: string, count = 1): boolean { return (this.state.inventory[id] ?? 0) >= count; }
  private add(id: string, count = 1): void { this.state.inventory[id] = (this.state.inventory[id] ?? 0) + count; }
  private flag(key: string): boolean { return this.state.flags[key] === true; }
  private mark(key: string): void { this.state.flags[key] = true; if (!this.state.journal.includes(key)) this.state.journal.push(key); }
  private remember(text: Text): Text { this.state.history.push(text); this.state.history = this.state.history.slice(-80); return text; }
  private completeKit(): void { if (this.has('flashlight') && this.flag('batteriesBought')) this.mark('suppliesBought'); }
  private option(he: string, en: string, action: string, disabled = false): DialogueOption { return { label: tx(he, en), action, disabled }; }
  private reserve(): number { return (this.has('flashlight') ? 0 : 45) + (this.flag('batteriesBought') ? 0 : 8); }
  private canSpend(price: number, essential = false): boolean { return this.state.money >= price && (essential || this.state.money - price >= this.reserve()); }
  objective(): Text {
    const completed = new Set(quests.filter(q => q.completion(this.state)).map(q => q.id));
    const current = quests.find(q => !completed.has(q.id) && q.prerequisites.every(p => completed.has(p)));
    if (current && (current.id === 'catacombs' || current.id === 'passage')) {
      const next = this.catacombSteps().find(step => !step.done);
      if (next) return tx(`${next.label.he} — ${next.hint.he}`, `${next.label.en} — ${next.hint.en}`);
    }
    return current?.objectives[0]
      ?? tx('הבוקר עולה. אפשר לשוב אל העיירה ולשמור את הזיכרון.', 'Morning rises. Return to town and carry the memory with you.');
  }
  /** The catacomb puzzle as a checklist with where-to-look hints (shown in the HUD and journal).
   *  Directions assume the player faces south, down the main corridor from the entrance. */
  catacombSteps(): CatacombStep[] {
    const f = (k: string) => this.flag(k);
    return [
      { id: 'inscriptionA', done: f('inscriptionA'), label: tx('לוח I · החותם הראשון', 'Panel I · the first seal'), hint: tx('בחדר המערבי — ימינה בצומת הראשון אחרי האולם.', 'in the west chamber — turn right at the first junction after the hall.') },
      { id: 'inscriptionB', done: f('inscriptionB'), label: tx('לוח II · החותם השני', 'Panel II · the second seal'), hint: tx('בחדר המזרחי — שמאלה בצומת הראשון.', 'in the east chamber — turn left at the first junction.') },
      { id: 'inscriptionC', done: f('inscriptionC'), label: tx('לוח III · החותם השלישי', 'Panel III · the third seal'), hint: tx('בחדר המרכזי — ישר במסדרון הראשי.', 'in the central chamber — straight down the main corridor.') },
      { id: 'mapA', done: f('mapA'), label: tx('חצי מפה A', 'Map half A'), hint: tx('על שולחן אבן בחדר הדרום־מערבי.', 'on a stone table in the south-west chamber.') },
      { id: 'mapB', done: f('mapB'), label: tx('חצי מפה B', 'Map half B'), hint: tx('על שולחן אבן בכניסה לחדר המרכזי.', 'on a stone table at the entrance of the central chamber.') },
      { id: 'lightRevealed', done: f('lightRevealed'), label: tx('הסימן הנסתר', 'The hidden mark'), hint: tx('הדליקו פנס (F) מול הקיר הכהה בחדר הדרום־מזרחי.', 'switch on your flashlight (F) facing the dark wall in the south-east chamber.') },
      { id: 'mechanismSolved', done: f('mechanismSolved'), label: tx('שלוש החותמות', 'The three seals'), hint: tx('בסוף המסדרון הראשי: לחצו לפי סדר הלוחות — נר, עץ, גל.', 'at the end of the main corridor: press them in the panels’ order — lamp, tree, wave.') },
      { id: 'hiddenOpened', done: f('hiddenOpened'), label: tx('המעבר החתום', 'The sealed passage'), hint: tx('דלת האבן מאחורי החותמות נפתחת כשכל השאר הושלם.', 'the stone door behind the seals opens once everything else is done.') },
    ];
  }
  private tryAutoOpen(): Text | null {
    const s = this.state;
    if (s.phase !== 2 || this.flag('hiddenOpened') || !this.flag('mechanismSolved') || !this.allInscriptions() || !this.flag('lightRevealed') || !this.mapComplete()) return null;
    this.mark('hiddenOpened'); s.phase = 3;
    return tx(' דלת האבן נגררת הצידה. פרק שלישי · פרסות בחשכה — האגף שמעבר לה בדיוני לחלוטין.', ' The stone door grinds aside. Chapter three · Hoofbeats in the dark — the annex beyond is entirely fictional.');
  }
  private missingClues(): Text {
    const missing = this.catacombSteps().filter(st => !st.done && st.id !== 'hiddenOpened' && st.id !== 'mechanismSolved');
    if (!missing.length) return tx('', '');
    return tx(`חסר: ${missing.map(m => m.label.he).join(', ')}.`, `Still missing: ${missing.map(m => m.label.en).join(', ')}.`);
  }
  interact(id: string): Dialogue {
    this.context = id;
    const o = this.option.bind(this);
    const d: Dialogue = { title: tx('טבעון', 'Tivon'), text: tx('רחוב שקט בטבעון. אפשר להמשיך ללכת.', 'A quiet Tivon street. You can keep walking.'), options: [] };
    switch (id) {
      case 'barista':
        d.title = tx('עמלי · הבריסטה', 'Amali · Barista');
        d.text = !this.flag('amaliClue')
          ? tx('״אתם נראים כאילו אתם צריכים קפה. קחו פולים לניסיון — המכונה שם. מישהו שאל היום על המערות הישנות; אמר שיהיה במנדו בערב — למטה בקריית עמל, בקומה השנייה ליד הצומת. פשוט הולכים במורד אלונים.״\nהדמות והשיחה בדיוניות.', '“You look like you could use a coffee. Take some beans to try—the espresso machine is on the counter. Someone asked about the old caves today; said they would be at Mandu tonight—down in Kiryat Amal, upstairs by the junction. Just follow Alonim Street downhill.”\nThis character and conversation are fictional.')
          : tx('״שני צעדים לפולים, שלוש שניות לחליטה, וכל היום מרגיש אחרת. ואם שואלים במנדו — לא אני סיפרתי.״', '“Two steps to the beans, three seconds to brew, and the whole day feels different. If anyone asks at Mandu—you did not hear it from me.”');
        if (!this.flag('amaliClue')) d.options.push(o('לקחת פולים ולשמוע על מנדו', 'Take the beans and ask about Mandu', 'acceptBeans'));
        else d.options.push(o('לקנות עוד פולים · ₪5', 'Buy more beans · ₪5', 'buyBeans'));
        d.options.push(o('לנוח ליד הקפה', 'Rest beside the café', 'rest'));
        break;
      case 'brewer': case 'brewer_mandu':
        d.title = tx('עמדת החליטה', 'Brewing station');
        d.text = this.state.brewing > 0 ? tx('המכונה פועלת. הקפה יהיה מוכן בעוד רגע.', 'The machine is working. Your coffee will be ready in a moment.')
          : tx('שתי מנות פולים הופכות לכוס קפה. החליטה אורכת שלוש שניות; את הכוס שותים בנפרד דרך המלאי.', 'Two measures of beans make a cup of coffee. Brewing takes three seconds; drink the prepared cup separately from inventory.');
        d.options.push(o('לחלוט קפה · 2 פולים', 'Brew coffee · 2 beans', 'brew', this.state.brewing > 0 || !this.has('coffee_beans', 2)));
        if (this.has('coffee')) d.options.push(o('לשתות קפה מוכן', 'Drink brewed coffee', 'drinkCoffee'));
        break;
      case 'bartender':
        if (!this.flag('coffeeDrunk')) {
          d.title = tx('קפה בינינו · בבוקר זה בית קפה', 'Café Beinenu · by day it is a café');
          d.text = tx('״בבוקר אנחנו קפה בינינו, בלילה — מנדו. רוצים פולים? המכונה בחצר, בעגלת הקפה ליד החלון המזרחי. ובערב תחזרו, אז מתחילים הסיפורים.״\nהדמות והשיחה בדיוניות.', '“By day we are Café Beinenu, by night — Mandu. Want some beans? The machine is in the backyard, at the coffee cart’s east window. Come back in the evening; that is when the stories start.”\nThis character and conversation are fictional.');
          d.options.push(o('לקנות פולים · ₪5', 'Buy beans · ₪5', this.flag('amaliClue') ? 'buyBeans' : 'beinenuBeans'));
          d.options.push(o('לשאול על הערב', 'Ask about the evening', 'caveContact'));
          break;
        }
        d.title = tx('מנדו · על הבר', 'Mandu · At the bar');
        d.text = !this.flag('coffeeDrunk') ? tx('״הערב עוד צעיר. עברתם בעמלי? תתחילו בקפה, ואז תחזרו אלינו.״', '“The evening is still young. Did you visit Amali? Start with a coffee, then come back.”')
          : tx('שיחות חופפות, צחוק וכוסות מצלצלות. ״משקה? המספר ליד הבר מדבר יותר כשהוא מרגיש בחברה. כולם חוזרים מפה ברגל.״\nצוות ואירועי העלילה בדיוניים.', 'Overlapping conversations, laughter, and clinking glasses. “A drink? The storyteller by the bar talks more when he feels among friends. Everyone is walking home.”\nStaff and story events are fictional.');
        if (this.flag('coffeeDrunk')) d.options.push(o('להזמין משקה · ₪12', 'Order a drink · ₪12', 'buyDrink', this.state.intoxication >= 80));
        if (this.flag('coffeeDrunk') && !this.flag('manduClue') && !this.canSpend(12)) d.options.push(o('להצטרף להרמת כוסית על חשבון הבית', 'Join a toast on the house', 'joinToast', this.state.intoxication >= 80));
        d.options.push(o('להצטרף לשיחה', 'Join the conversation', 'barChat'));
        d.options.push(o('לשאול מי מכיר את המערות', 'Ask who knows about the caves', 'caveContact'));
        break;
      case 'storyteller':
        d.title = tx('מנדו · המספר', 'Mandu · The storyteller');
        if (this.flag('manduClue')) d.text = tx('״פרסות, אני אומר לכם. מתחת לאדמה. אם אתם הולכים לבית שערים, אל תשכחו פנס וסוללות. נסו בבית התוכנה והמחשב, הבונים 2 — מזרחה לאורך חנה סנש, ליד הכיכר.״', '“Hooves, I tell you. Underground. If you walk to Beit She’arim, do not forget a flashlight and batteries. Try Beit HaTochna VeHaMachshev at 2 HaBonim—east along Hannah Szenes, by the roundabout.”');
        else if (!this.flag('coffeeDrunk')) d.text = tx('״הבריסטה מעמלי שלח אתכם? תסיימו קודם את הקפה שלו — חולטים בעמדה, ואז שותים דרך התיק. אני אשב כאן.״', '“Did the Amali barista send you? Finish his coffee first—brew at the station, then drink it from your bag. I will be right here.”');
        else if (this.state.intoxication < 45) d.text = tx('״סיפור על המערות? זה סיפור לערב ארוך, לא לריאיון. שבו איתנו, הזמינו משהו.״\nהסיפור נפתח בשיחה פעילה לאחר שני משקאות.', '“A cave story? That is a long-evening story, not an interview. Spend some time with us, order something.”\nThe story opens through an active conversation after two drinks.');
        else { d.text = tx('הוא מתקרב כדי להתגבר על המוזיקה. ״טוב. מבטיחים לא לצחוק?״', 'He leans closer over the music. “All right. Promise not to laugh?”'); d.options.push(o('להקשיב לסיפור על המערות', 'Listen to the cave story', 'hearCaveStory')); }
        if (!this.flag('manduClue') && (!this.flag('coffeeDrunk') || this.state.intoxication < 45)) d.options.push(o('לשאול על המערות', 'Ask about the caves', 'askCaves'));
        if (this.flag('coffeeDrunk') && !this.flag('manduClue') && this.state.intoxication < 80) {
          d.options.push(this.canSpend(12) ? o('להזמין משקה לשולחן · ₪12', 'Order a drink at the table · ₪12', 'buyDrink') : o('להצטרף לכוסית על חשבון הבית', 'Join a toast on the house', 'joinToast'));
        }
        d.options.push(o('לשאול על החיים בטבעון', 'Ask about life in Tivon', 'localChat'));
        break;
      case 'local':
        d.title = tx('שיחה מקומית', 'A local conversation');
        d.text = tx('״בטבעון אפילו הדרך לקנות לחם נחשבת לטיול בעלייה. לפחות בדרך חזרה זה בירידה. בדרך כלל.״', '“In Tivon, even buying bread counts as an uphill hike. At least the way home is downhill. Usually.”');
        d.options.push(o('לשבת ולנוח לרגע', 'Sit and rest a moment', 'rest'));
        d.options.push(o('לשאול על סיפור המערות', 'Ask about the cave story', 'caveContact'));
        break;
      case 'dima':
        d.title = tx('גט פון · דימה', 'Get Phone · Dima');
        d.text = tx('״אהלן! מטען, כבל, כיסוי? ...פנס? בשביל מה, הולכים לחפש את החזירים בלילה? יש לי פנס LED טוב וסוללות. הכי חזק בטבעון.״\nשם החנות אמיתי; הדמות והשיחה בדיוניות.', '“Hey! Charger, cable, case? ...A flashlight? What for, hunting boars at night? I have a good LED torch and batteries. Strongest in Tivon.”\nThe shop is real; this character and conversation are fictional.');
        if (!this.has('flashlight')) d.options.push(o('לקנות פנס · ₪45', 'Buy flashlight · ₪45', 'buyFlashlight'));
        d.options.push(o('לקנות סוללות · ₪8', 'Buy batteries · ₪8', 'buyBatteries'));
        d.options.push(o('לשאול מה חדש בטבעון', 'Ask what is new in Tivon', 'dimaChat'));
        break;
      case 'shopkeeper':
        d.title = tx('בית התוכנה והמחשב · הבונים 2', 'Beit HaTochna VeHaMachshev · HaBonim 2');
        d.text = this.flag('manduClue')
          ? tx('״למערות? פנס טוב וסוללות רזרביות. אני מתקן מחשבים, לא חושך. לבית שערים הולכים דרומה בהבונים ואז בדרך הגן הלאומי.״\nשם העסק וכתובתו אומתו לפי הקישור שסופק. החזית בקירוב; הצוות, הסחורה ועלילת המשחק בדיוניים.', '“The caves? A good light and spare batteries. I fix computers, not darkness. For Beit She’arim, head south down HaBonim, then follow the national park road.”\nThe business name and address were verified from the supplied link. The frontage is approximate; staff, merchandise, and story events are fictional.')
          : tx('״ברוכים הבאים. תסתכלו בנחת. אם תצטרכו ציוד לטיול, ספרו לי לאן אתם הולכים.״\nרכישת ציוד המסע נפתחת אחרי השיחה במנדו.', '“Welcome. Have a look around. If you need equipment for a walk, tell me where you are headed.”\nJourney supplies unlock after the Mandu conversation.');
        if (this.flag('manduClue')) {
          if (!this.has('flashlight')) d.options.push(o('לקנות פנס · ₪45', 'Buy flashlight · ₪45', 'buyFlashlight'));
          d.options.push(o('לקנות סוללות · ₪8', 'Buy batteries · ₪8', 'buyBatteries'));
          if (this.needsEmergencyBattery()) d.options.push(o('לבקש סוללת חירום', 'Ask for an emergency battery', 'emergencyBattery'));
        }
        d.options.push(o('לנוח לפני ההליכה', 'Rest before the walk', 'rest'));
        break;
      case 'statue':
        d.title = tx('הפרש על הגבעה', 'The rider on the hill');
        d.text = tx('רוכב ברונזה על סוס, מביט מזרחה אל העמק, על בסיס אבן גבוה: ״אלכסנדר זייד, שומר בישראל״. זייד היה מאנשי השומר ושמר על אדמות האזור עד מותו ב־1938. המודל במשחק הוא פרשנות פשוטה; הסיפור העל־טבעי בדיוני.', 'A bronze rider on horseback looks east over the valley from a tall stone base: “Alexander Zaid, a watchman in Israel.” Zaid belonged to Hashomer and guarded the area’s lands until his death in 1938. The game model is a simple interpretation; the supernatural story is fiction.');
        break;
      case 'cave_entrance':
        d.title = tx('בית שערים · סף המערות', 'Beit She’arim · Cave entrance');
        d.text = this.flag('cavesEntered')
          ? tx('מסדרונות אבן גיר, תאי קבורה וארונות אבן. מסלול המשחק סכמטי; החידות והאגף הנסתר בדיוניים. הכניסה לאתר בעולם האמיתי כפופה לכללי רשות הטבע והגנים.', 'Limestone corridors, burial chambers, and stone sarcophagi. This game route is schematic; puzzles and the hidden annex are fictional. Real-world access is governed by the Israel Nature and Parks Authority.')
          : tx('מבעד לכניסה נושבת רוח קרירה. כדי לחקור נדרשים הסיפור ממנדו, פנס וסוללות רזרביות. הכניסה מכאן היא תחילת הפרק השני.', 'Cool air slips through the entrance. Investigating requires the Mandu story, a flashlight, and spare batteries. Entering begins chapter two.');
        if (!this.flag('cavesEntered')) d.options.push(o('להתחיל לחקור את המערות', 'Begin exploring the catacombs', 'enterCaves'));
        d.options.push(o('לנוח ליד הכניסה', 'Rest by the entrance', 'rest'));
        if (this.needsEmergencyBattery()) d.options.push(o('לקחת סוללת חירום מארגז הציוד', 'Take an emergency battery from the supplies', 'emergencyBattery'));
        break;
      case 'inscription_a': case 'inscription_b': case 'inscription_c': {
        const letter = id.slice(-1), n = ({ a: 'I', b: 'II', c: 'III' } as Record<string, string>)[letter];
        const key = `inscription${letter.toUpperCase()}`;
        d.title = tx(`לוח ${n} מתוך III · כתובת משוחזרת`, `Panel ${n} of III · Reconstructed inscription`);
        const inscriptions: Record<string, Text> = {
          a: tx('״תחילה האור, כדי שנוכל לראות זה את זה.״\nסמל: נר — זה החותם הראשון.\nטקסט חידה בדיוני, לא ציטוט עתיק. תבליטי מנורות הם ממאפייני האתר ששימשו השראה לסצנה.', '“First the light, so that we may see one another.”\nSymbol: lamp — this is the FIRST seal.\nFictional puzzle text, not an ancient quotation. Menorah reliefs at the site inspired this scene.'),
          b: tx('״אחרי הלהבה מכים שורשים.״\nסמל: עץ — זה החותם השני.\nכתובת בדיונית. בחנו גם את ארונות האבן; שמות, שפות וסמלים מעידים על קהילה רחבה.', '“After the flame, roots take hold.”\nSymbol: tree — this is the SECOND seal.\nInvented inscription. Examine the sarcophagi as well; names, languages, and symbols speak of a far-reaching community.'),
          c: tx('״בסוף יבואו המים, והחיים ימשיכו.״\nסמל: גל — זה החותם השלישי והאחרון.\nכתובת בדיונית. יש לקרוא חפצים בהקשרם ולשמור את אתר הקבורה בכבוד.', '“Last comes water, and life will continue.”\nSymbol: wave — this is the THIRD and last seal.\nInvented inscription. Objects should be understood in context and the burial site treated with respect.'),
        };
        d.text = inscriptions[letter];
        if (this.state.phase >= 2) d.options.push(o(this.flag(key) ? 'כבר ביומן — לתעד שוב' : 'לתעד ביומן', this.flag(key) ? 'Already in your journal — record again' : 'Record in the journal', `readInscription${letter.toUpperCase()}`));
        break;
      }
      case 'light_mark':
        d.title = tx('סימן חיוור באבן', 'A faint mark in stone');
        d.text = this.state.flashlightOn && this.state.battery > 0
          ? tx('באור הפנס נראים מנורה, עץ וגל ליד מסגרת נסתרת. סימון המשחק בדיוני. המנגנון מקשיב לאותו סדר כמו הכתובות.', 'In the beam, a lamp, tree, and wave appear beside a concealed frame. This game marking is fictional. The mechanism follows the same order as the inscriptions.')
          : tx('שריטות חיוורות בקיר הכהה. באור החלש אי אפשר לקרוא אותן. הדליקו את הפנס (F), כוונו אליהן ונסו שוב.', 'Faint scratches on the dark wall. In this dim light they cannot be read. Switch on your flashlight (F), aim at them and try again.');
        if (this.state.phase >= 2) d.options.push(o('לתעד את הסימנים', 'Record the marks', 'revealLight', !this.state.flashlightOn || this.state.battery <= 0));
        break;
      case 'map_a': case 'map_b':
        d.title = tx('קטע ממפת חוקר', 'An explorer’s map fragment');
        d.text = id === 'map_a' ? tx('חצי מפה מציג אולם המחובר לשלושה חדרים. קו נקטע מאחורי האולם. המפה היא המצאה לצורכי המשחק.', 'Half a map shows a hall connected to three chambers. A line breaks off behind it. This map was invented for the game.')
          : tx('החצי השני מציג פתח מעבר לאולם. לידו נכתב: ״אותו הסדר באבן ובאור.״ זהו רמז בדיוני, לא ממצא ארכאולוגי.', 'The second half shows an opening beyond the hall. Beside it: “The same order in stone and light.” This is a fictional clue, not an archaeological find.');
        if (this.state.phase >= 2) d.options.push(o('לאסוף את קטע המפה', 'Collect the map fragment', id === 'map_a' ? 'collectMapA' : 'collectMapB'));
        break;
      case 'mechanism': {
        d.title = tx('שלוש החותמות · מנגנון בדיוני', 'The three seals · fictional mechanism');
        const solved = this.flag('mechanismSolved');
        const lit = [this.flag('sequenceLamp') || solved, this.flag('sequenceTree') || solved, solved];
        const row = (he: boolean) => (he ? ['נר', 'עץ', 'גל'] : ['Lamp', 'Tree', 'Wave']).map((x, i) => (lit[i] ? '● ' : '○ ') + x).join('   ');
        if (solved) d.text = tx(`${row(true)}\nשלוש החותמות דולקות. ${this.flag('hiddenOpened') ? 'הדלת שמאחור פתוחה.' : this.missingClues().he || 'הדלת שמאחור משתחררת.'}`, `${row(false)}\nAll three seals glow. ${this.flag('hiddenOpened') ? 'The door behind is open.' : this.missingClues().en || 'The door behind is releasing.'}`);
        else if (!this.allInscriptions()) d.text = tx(`${row(true)}\nשלוש אבנים עגולות: נר, עץ וגל. צריך ללחוץ עליהן בסדר הנכון — והסדר חצוב על שלושה לוחות בחדרים הצדדיים. ${this.missingClues().he}`, `${row(false)}\nThree round stones: lamp, tree and wave. They must be pressed in the right order — and the order is carved on three panels in the side chambers. ${this.missingClues().en}`);
        else d.text = tx(`${row(true)}\nהלוחות שקראתם: I נר, II עץ, III גל. לחצו בסדר הזה. טעות מחזירה את האבנים למקום.`, `${row(false)}\nThe panels you read: I lamp, II tree, III wave. Press them in that order. A mistake resets the stones.`);
        if (this.state.phase >= 2 && !solved) d.options.push(o('ללחוץ על הנר · אור', 'Press the lamp · light', 'stoneLamp'), o('ללחוץ על העץ · שורש', 'Press the tree · root', 'stoneTree'), o('ללחוץ על הגל · מים', 'Press the wave · water', 'stoneWater'));
        break;
      }
      case 'hidden_gate':
        d.title = tx('דלת האבן החתומה', 'The sealed stone door');
        d.text = this.flag('hiddenOpened') ? tx('הדלת פתוחה. מעבר לה — אגף בדיוני לחלוטין.', 'The door is open. Beyond it lies an entirely fictional annex.')
          : tx(`אבן דקה מסתירה אוויר קר וחלל עמוק יותר. היא נפתחת כששלוש החותמות דולקות וכל הרמזים נאספו. ${this.missingClues().he}${this.flag('mechanismSolved') ? '' : ' החותמות עוד כבויות.'}`, `Thin stone hides cold air and a deeper space. It opens once the three seals glow and every clue is gathered. ${this.missingClues().en}${this.flag('mechanismSolved') ? '' : ' The seals are still dark.'}`);
        d.options.push(o('לנסות לפתוח', 'Try to open it', 'openHidden'));
        break;
      case 'explorer_note':
        d.title = tx('יומן שנשאר באפלה', 'A journal left in darkness');
        d.text = tx('״שמעתי פרסות במקום שאין בו שמיים. השומר הסתער, אך נעצר כשעברתי מאחורי האבן. הוא לא שומר על זהב. הוא שכח למען מי נשבע. כשההסתערות תחלוף, חפשו את האור, את התמונה ואת המילים.״\nזהו יומן בדיוני.', '“I heard hooves where there is no sky. The guardian charged, but stopped when I moved behind the stone. He does not guard gold. He has forgotten for whom he swore his oath. When the charge passes, seek the light, the picture, and the words.”\nThis journal is fictional.');
        if (this.state.phase >= 3) d.options.push(o('לשמור את היומן', 'Keep the journal', 'readExplorer'));
        if (this.needsEmergencyBattery()) d.options.push(o('לקחת סוללת חירום מהתיק', 'Take an emergency battery from the pack', 'emergencyBattery'));
        break;
      case 'guardian':
        d.title = tx('השומר', 'The guardian');
        d.text = this.flag('spiritFreed') ? tx('הדממה כבר אינה איום.', 'The silence is no longer a threat.')
          : this.state.encounter.survived ? tx('הצל נסוג. בין האבנים נראים שלושה זיכרונות. מי היה כאן לפני שהפך לשומר?', 'The shadow withdraws. Three memories lie among the stones. Who was here before he became the guardian?')
          : tx('פרסות מהדהדות. צל של רוכב נקרע מתוך החשכה. קראו תחילה את יומן החוקר; במפגש הישארו בתנועה והשתמשו בעמודים כמחסה.', 'Hooves echo. A rider’s silhouette tears out of the dark. Read the explorer’s journal first; during the encounter, keep moving and use the pillars as cover.');
        if (!this.state.encounter.survived && !this.state.encounter.active) d.options.push(o('להתקרב אל השומר', 'Approach the guardian', 'faceGuardian'));
        break;
      case 'memory_lantern': case 'memory_photo': case 'memory_letter': {
        const item = items[id]; d.title = item.name; d.text = item.description;
        if (!this.state.encounter.survived) d.text = tx('הסערה אינה מניחה לכם להתקרב. שרדו תחילה את המפגש עם השומר.', 'The storm keeps you away. Survive the guardian’s first encounter before approaching.');
        else d.options.push(o('לאסוף ולהקשיב לזיכרון', 'Collect and listen to the memory', `collect_${id}`));
        break;
      }
      case 'oath':
        d.title = this.flag('identityRevealed') ? tx('השבועה של אלכסנדר זייד', 'Alexander Zeid’s oath') : tx('שבועה שנשכחה', 'A forgotten oath');
        d.text = !this.flag('identityRevealed') ? tx('שלושה זיכרונות חסרים. בלי האנשים, המקום והמילים, השבועה נשארת כלא.', 'Three memories are missing. Without the people, the place, and the words, the oath remains a prison.')
          : this.flag('spiritFreed') ? tx('״העמק אינו זקוק לעוד מלחמה. הוא זקוק למי שימשיך לחיות בו.״', '“The valley does not need another battle. It needs people who will go on living here.”')
          : tx('זה אלכסנדר זייד. זייד ההיסטורי היה שומר, ממייסדי השומר, ונקשר לשייח׳ אבריק. רוח הרפאים והחפצים הם בדיה. הזכירו לו את השבועה: קודם האנשים שבאור הפנס, אחריהם המקום שבתמונה, ולבסוף הזיכרון שבמכתב.', 'This is Alexander Zeid. The historical Zeid was a watchman, a founder of Hashomer, and associated with Sheikh Abreik. The ghost and these objects are fictional. Restore the oath: first the people in the lantern’s light, then the place in the picture, and finally the memory in the letter.');
        if (this.flag('identityRevealed') && !this.flag('spiritFreed')) d.options.push(o('האנשים · להרים את הפנס', 'The people · Raise the lantern', 'oathPeople'), o('המקום · להציג את התמונה', 'The place · Show the picture', 'oathPlace'), o('הזיכרון · לקרוא את המכתב', 'The memory · Read the letter', 'oathMemory'));
        break;
      case 'treasure':
        d.title = tx('ארכיון העמק', 'The valley archive');
        d.text = this.flag('spiritFreed') ? tx('אין כאן ערמת זהב. יש שמות, סיפורים ומפות: זיכרונה של קהילה מדומיינת. האוצר אינו רכוש לקחת; הוא דבר לשמר ולהעביר הלאה.', 'There is no heap of gold. There are names, stories, and maps: the memory of an imagined community. The treasure is something to preserve and pass on.')
          : tx('הרוח עוד קשורה לשבועתה. תחילה צריך לעזור לה להיזכר.', 'The spirit is still bound to its oath. First help it remember.');
        if (this.flag('spiritFreed')) d.options.push(o('לתעד את הארכיון ולהגן עליו', 'Document and preserve the archive', 'openTreasure'));
        break;
      case 'overlook':
        d.title = tx('מדרגות אל אור היום', 'Stairs up to daylight');
        d.text = this.flag('treasureFound') ? tx('אור ראשון על הגבעות. זייד רוכב אל האופק, סוף סוף ללא מרדף. מאחוריכם העיירה מתעוררת: כוסות קפה, שיחות, צעדים בדרך הביתה. השמירה ממשיכה בחיים עצמם.\nהסוף.', 'First light touches the hills. Zeid rides toward the horizon, finally without pursuit. Behind you, the town wakes: coffee cups, conversations, footsteps on the way home. The watch continues in life itself.\nThe end.')
          : tx('העמק מחכה. יש עוד סיפור שצריך להביא אל האור.', 'The valley waits. There is still a story to bring into the light.');
        if (this.flag('treasureFound')) d.options.push(o('לשמור את הזיכרון', 'Carry the memory forward', 'finish'));
        break;
      default: {
        if (id.startsWith('keeper_')) {
          const t = keeperFor(id) ?? KEEPER_FALLBACK; d.title = t.title; d.text = t.lines[0];
          d.options.push(o('ומה עוד?', 'Anything else?', 'keeperMore'), o('תודה, להתראות', 'Thanks, see you', 'keeperBye'));
          break;
        }
        if (id.startsWith('npc_')) {
          const n = this.chats.get(id) ?? 0, idx = (Number(id.slice(4)) * 7 + n) % CHATTER.length;
          d.title = tx('תושב/ת טבעון', 'A Tivon local'); d.text = CHATTER[idx];
          d.options.push(o('ומה עוד?', 'And what else?', 'chatMore'), o('להסכים בנימוס', 'Agree politely', 'agree'));
          break;
        }
        const lm = id.startsWith('landmark_') ? LANDMARKS.find(l => `landmark_${l.id}` === id) : undefined;
        if (lm) { d.title = lm.name; d.text = lm.about; }
      }
    }
    this.allowed = new Set(d.options.filter(option => !option.disabled).map(option => option.action));
    this.remember(d.text);
    return d;
  }

  private needsEmergencyBattery(): boolean { return this.has('flashlight') && !this.has('batteries') && this.state.battery < 12 && this.state.money < 8; }
  private allInscriptions(): boolean { return ['inscriptionA', 'inscriptionB', 'inscriptionC'].every(k => this.flag(k)); }
  private mapComplete(): boolean { return this.flag('mapA') && this.flag('mapB'); }
  private result(he: string, en: string): Text { return this.remember(tx(he, en)); }
  act(action: string): Text {
    const s = this.state;
    const global = ['drinkCoffee', 'toggleFlashlight', 'replaceBattery'].includes(action);
    if (!global && !this.allowed.has(action)) return this.result('גשו אל האדם או החפץ ובחרו פעולה זמינה.', 'Approach the person or object and choose an available action.');
    switch (action) {
      case 'acceptBeans':
        if (this.flag('amaliClue')) break;
        this.add('coffee_beans', 6); this.add('amali_note'); this.mark('amaliClue'); this.mark('beansReceived');
        return this.result('קיבלתם 6 פולים ופתק. מכונת החליטה נמצאת ליד הדלפק.', 'Received 6 measures of beans and a note. The brewing machine is beside the counter.');
      case 'beinenuBeans':
        if (!this.canSpend(5)) return this.result('שמרו כסף לפנס ולסוללות.', 'Keep enough money for a flashlight and batteries.');
        s.money -= 5; this.add('coffee_beans', 4);
        if (!this.flag('amaliClue')) { this.mark('amaliClue'); this.mark('beansReceived'); this.add('amali_note'); }
        return this.result('נרכשו 4 פולים. ״שמעתי שמישהו שואל על המערות. בערב הוא יהיה כאן, על המרפסת.״', 'Bought 4 measures of beans. “I heard someone asking about the caves. He will be here tonight, on the balcony.”');
      case 'buyBeans':
        if (!this.canSpend(5)) return this.result('שמרו כסף לפנס ולסוללות. אפשר לנוח בחינם ליד הקפה.', 'Keep enough money for a flashlight and batteries. Resting by the café is free.');
        s.money -= 5; this.add('coffee_beans', 4); return this.result('נרכשו 4 פולים ב־₪5.', 'Bought 4 measures of beans for ₪5.');
      case 'brew':
        if ((this.context !== 'brewer' && this.context !== 'brewer_mandu') || s.brewing > 0 || !this.has('coffee_beans', 2) || !this.flag('amaliClue')) return this.result('צריך שתי מנות פולים ומכונת חליטה פנויה.', 'You need two measures of beans and an available brewing station.');
        s.inventory.coffee_beans -= 2; s.brewing = 3;
        return this.result('החליטה התחילה. הקפה יהיה מוכן בעוד שלוש שניות.', 'Brewing started. Your coffee will be ready in three seconds.');
      case 'drinkCoffee':
        if (!this.has('coffee')) return this.result('אין קפה מוכן. חלוטו פולים בעמדת חליטה.', 'No prepared coffee. Brew beans at a brewing station.');
        s.inventory.coffee -= 1; s.wakefulness = Math.min(100, s.wakefulness + 32); this.mark('coffeeDrunk');
        return this.result('שתיתם קפה. הערנות עלתה. הפתק מעמלי מוביל למנדו.', 'Coffee drunk. Wakefulness restored. The Amali note leads to Mandu.');
      case 'rest':
        s.wakefulness = 100; s.intoxication = Math.max(0, s.intoxication - 15);
        return this.result('מנוחה קצרה החזירה את הערנות. הדרך ממשיכה ברגל.', 'A short rest restored your wakefulness. Your journey continues on foot.');
      case 'buyDrink':
        if (!this.flag('coffeeDrunk')) break;
        if (s.intoxication >= 80) return this.result('הברמן מציע לעצור כאן ולשתות מים.', 'The bartender suggests stopping here and drinking water.');
        if (!this.canSpend(12)) return this.result('צריך לשמור כסף לציוד. המספר יקשיב אם תחזרו עם פתק מעמלי.', 'Keep money for equipment. The storyteller will listen when you return with the Amali note.');
        s.money -= 12; s.intoxication = Math.min(100, s.intoxication + 28); s.wakefulness = Math.max(0, s.wakefulness - 4);
        return s.intoxication >= 45
          ? this.result('המספר רוכן קדימה. ״טוב, עכשיו אתם חלק מהחבורה. תשאלו על המערות.״ אפשר לבחור בשיחה על המערות.', 'The storyteller leans closer. “All right, you are part of the company now. Ask me about the caves.” The cave conversation is ready.')
          : this.result('המשקה הראשון מחמם את הגרון. המספר עדיין מחייך ומתחמק. עוד משקה ושיחה יפתחו את הסיפור.', 'The first drink warms your throat. The storyteller still smiles and evades the question. Another drink and a conversation will open the story.');
      case 'askCaves':
        if (!this.flag('coffeeDrunk')) return this.result('״קודם הקפה של עמלי. השתמשו במכונת החליטה ואז שתו את הכוס מהתיק עם I. אחרי זה, נחגוג כאן עם שני משקאות ונשוחח.״', '“First, Amali’s coffee. Use the brewing machine, then press I to drink the prepared cup. After that, join me here for two drinks and a conversation.”');
        return this.result('״עוד לא, עוד לא. שבו איתי.״ הזמינו משקה לשולחן. הסיפור נפתח אחרי שני משקאות, ואז צריך לשאול אותו שוב.', '“Not yet. Sit with me a while.” Order a drink at the table. After two drinks, ask him again to hear the story.');
      case 'caveContact':
        return this.result('״חפשו את המספר אפור־השיער — יושב על המרפסת, ליד הדלת של הבר. חולצה אפורה וזקן. לחצו E מולו ושאלו על המערות. אפשר להזמין משקה גם אצלו.״', '“Find the gray-haired storyteller — he sits on the balcony by the bar door. Gray shirt, beard. Face him, press E and ask about the caves. You can order drinks at his table too.”');
      case 'joinToast':
        if (!this.flag('coffeeDrunk') || this.flag('manduClue') || this.canSpend(12) || s.intoxication >= 80) break;
        s.intoxication = Math.min(100, s.intoxication + 28); s.wakefulness = Math.max(0, s.wakefulness - 4);
        return this.result('״לחיי מי שבא ברגל!״ הכוסית על חשבון הבית. שמרו את הכסף לציוד ודברו עם המספר.', '“To everyone who walked here!” The toast is on the house. Keep your money for equipment and speak to the storyteller.');
      case 'hearCaveStory':
        if (!this.flag('coffeeDrunk') || s.intoxication < 45) return this.result('המספר עוד לא מוכן לחלוק את הסיפור.', 'The storyteller is not ready to share the story yet.');
        if (!this.flag('manduClue')) { this.mark('manduClue'); this.add('cave_note'); }
        return this.result('״שמעתי פרסות מתחת לבית שערים. לא צעד, לא מים — סוס.״ ביומן נוסף רמז. קנו פנס וסוללות בבית התוכנה והמחשב, הבונים 2, לפני ההליכה.', '“I heard hoofbeats beneath Beit She’arim. Not footsteps, not water—a horse.” A clue was added to your journal. Buy a flashlight and batteries from Beit HaTochna VeHaMachshev, HaBonim 2, before the walk.');
      case 'dimaChat': return this.result('״מה חדש? המעבדה. מתקנים מחשבים, טלפונים, מה שנשבר. ואם אתם הולכים לבית שערים בלילה — תיקחו סוללה רזרבית. תאמינו לי.״', '“What is new? The lab. We fix computers, phones, whatever breaks. And if you are going to Beit She’arim at night — take a spare battery. Trust me.”');
      case 'keeperMore': case 'keeperBye': {
        if (action === 'keeperBye') return this.result('״להתראות! תבואו שוב.״', '“See you! Come again.”');
        const n = (this.chats.get(this.context) ?? 0) + 1; this.chats.set(this.context, n); return this.remember((keeperFor(this.context) ?? KEEPER_FALLBACK).lines[n % 2]);
      }
      case 'chatMore': case 'agree': {
        const n = (this.chats.get(this.context) ?? 0) + 1; this.chats.set(this.context, n);
        if (action === 'agree') return this.result('״נכון?! סוף סוף מישהו מבין.״', '“Right?! Finally someone gets it.”');
        const idx = (Number(this.context.slice(4)) * 7 + n) % CHATTER.length; return this.remember(CHATTER[idx]);
      }
      case 'barChat': return this.result('״יש פה ויכוח אם העליות בטבעון נעשות תלולות יותר כשחוזרים מהבר. המדגם לא מייצג.״', '“We are debating whether Tivon’s hills get steeper on the way home from the bar. The sample is not representative.”');
      case 'localChat': return this.result('״בטבעון מכירים את כולם. ואם לא מכירים, מישהו כבר יזכיר לכם איפה נפגשתם.״', '“Everyone knows everyone in Tivon. If you do not, someone will remind you where you met.”');
      case 'buyFlashlight':
        if ((!this.flag('manduClue') && this.context !== 'dima') || this.has('flashlight')) break;
        if (!this.canSpend(45, true)) return this.result('אין מספיק כסף. הפנס עולה ₪45.', 'Not enough money. The flashlight costs ₪45.');
        s.money -= 45; this.add('flashlight'); s.battery = 100; this.completeKit();
        return this.result('הפנס נוסף למלאי. F מדליק אותו. קחו גם סוללות רזרביות.', 'Flashlight added. Press F to switch it on. Take spare batteries too.');
      case 'buyBatteries':
        if (!this.flag('manduClue') && this.context !== 'dima') break;
        if (!this.canSpend(8, true) || (!this.has('flashlight') && s.money - 8 < 45)) return this.result('אין מספיק כסף לסוללות ולציוד החיוני.', 'Not enough money for batteries and the essential equipment.');
        s.money -= 8; this.add('batteries'); this.mark('batteriesBought'); this.completeKit();
        return this.result('סוללות נוספו למלאי. אפשר להחליף סוללה דרך I.', 'Spare batteries added. Replace a battery from inventory with I.');
      case 'toggleFlashlight':
        if (!this.has('flashlight')) return this.result('קנו פנס אחרי השיחה במנדו.', 'Buy a flashlight after the Mandu conversation.');
        if (s.battery <= 0) { s.flashlightOn = false; return this.result('הסוללה התרוקנה. החליפו אותה במלאי.', 'The battery is empty. Replace it from inventory.'); }
        s.flashlightOn = !s.flashlightOn;
        return this.result(s.flashlightOn ? 'הפנס דולק.' : 'הפנס כבוי.', s.flashlightOn ? 'Flashlight on.' : 'Flashlight off.');
      case 'replaceBattery':
        if (!this.has('flashlight') || !this.has('batteries')) return this.result('צריך פנס וסוללה חלופית.', 'You need a flashlight and a spare battery.');
        if (s.battery >= 99) return this.result('הסוללה עדיין מלאה.', 'The battery is still full.');
        s.inventory.batteries -= 1; s.battery = 100;
        return this.result('הסוללה הוחלפה. המטען חזר ל־100%.', 'Battery replaced. Charge restored to 100%.');
      case 'emergencyBattery':
        if (!this.needsEmergencyBattery()) break;
        this.add('batteries'); return this.result('קיבלתם סוללת חירום. הדרך נשארת פתוחה.', 'Received an emergency battery. The way remains open.');
      case 'enterCaves':
        if (!this.flag('manduClue') || !this.has('flashlight') || !this.flag('batteriesBought') || (s.battery <= 0 && !this.has('batteries'))) return this.result('תחילה הסיפור במנדו, ואז פנס וסוללות מבית התוכנה והמחשב, הבונים 2.', 'First hear the Mandu story, then buy a flashlight and spare batteries from Beit HaTochna VeHaMachshev, HaBonim 2.');
        s.phase = 2; this.mark('cavesEntered');
        return this.result('פרק שני · הקטקומבות הנשכחות. בקצה המסדרון הראשי יש דלת אבן חתומה. כדי לפתוח אותה: קראו את שלושת הלוחות החצובים (I, II, III) בחדרים הצדדיים — הם מגלים את סדר החותמות; אספו את שני חצאי המפה; האירו בפנס (F) את הקיר הכהה בחדר הדרום־מזרחי; ואז לחצו על שלוש החותמות לפי הסדר. הרשימה בפינת המסך מתעדכנת.', 'Chapter two · The forgotten catacombs. At the end of the main corridor is a sealed stone door. To open it: read the three carved panels (I, II, III) in the side chambers — they give the order of the seals; collect both map halves; shine your flashlight (F) on the dark wall in the south-east chamber; then press the three seals in order. The checklist in the corner of the screen keeps track.');
      case 'readInscriptionA': case 'readInscriptionB': case 'readInscriptionC': {
        if (s.phase < 2) break;
        const flag = `inscription${action.slice(-1)}`;
        if (!this.flag(flag)) { this.mark(flag); this.add('inscription_notes'); }
        { const opened = this.tryAutoOpen(); const n = this.catacombSteps().slice(0, 3).filter(x => x.done).length; return this.result(`נרשם ביומן (${n}/3 לוחות).${opened?.he ?? ''}`, `Recorded in your journal (${n}/3 panels).${opened?.en ?? ''}`); }
      }
      case 'revealLight':
        if (s.phase < 2 || !s.flashlightOn || s.battery <= 0) return this.result('כוונו פנס דולק אל הסימן.', 'Aim a working flashlight at the mark.');
        this.mark('lightRevealed'); { const opened = this.tryAutoOpen(); return this.result(`באור הפנס מופיעים נר, עץ וגל — אותו סדר כמו בלוחות.${opened?.he ?? ''}`, `In the beam a lamp, a tree and a wave appear — the same order as the panels.${opened?.en ?? ''}`); }
      case 'collectMapA': case 'collectMapB': {
        if (s.phase < 2) break;
        const flag = action === 'collectMapA' ? 'mapA' : 'mapB';
        if (!this.flag(flag)) { this.mark(flag); this.add('map_fragment'); }
        if (this.mapComplete() && !this.has('cave_map')) this.add('cave_map');
        { const opened = this.tryAutoOpen(); return this.mapComplete() ? this.result(`שני החלקים התחברו (M למפה). המעבר הנסתר נמצא מאחורי החותמות.${opened?.he ?? ''}`, `The two halves fit (M for map). The hidden passage lies behind the seals.${opened?.en ?? ''}`) : this.result('חצי מפה נוסף למלאי. החצי השני בחדר אחר.', 'Half a map added. The other half is in another chamber.'); }
      }
      case 'stoneLamp': case 'stoneTree': case 'stoneWater':
        if (s.phase < 2 || !this.allInscriptions()) return this.result(`האבנים לא זזות. הסדר חצוב על שלושת הלוחות בחדרים הצדדיים — קראו את כולם קודם. ${this.missingClues().he}`, `The stones will not move. The order is carved on the three panels in the side chambers — read them all first. ${this.missingClues().en}`);
        if (this.flag('mechanismSolved')) return this.result('המנגנון כבר פתוח.', 'The mechanism is already open.');
        if (action === 'stoneLamp' && !this.flag('sequenceLamp')) { s.flags.sequenceLamp = true; s.flags.sequenceTree = false; return this.result('האור נדלק. מה בא אחרי הלהבה?', 'The light comes on. What follows the flame?'); }
        if (action === 'stoneTree' && this.flag('sequenceLamp') && !this.flag('sequenceTree')) { s.flags.sequenceTree = true; return this.result('השורש מתחבר לאור. מה מגיע אחרון?', 'The root joins the light. What comes last?'); }
        if (action === 'stoneWater' && this.flag('sequenceLamp') && this.flag('sequenceTree')) { this.mark('mechanismSolved'); const opened = this.tryAutoOpen(); return opened ? this.result(`האבן זזה: אור, שורש, מים.${opened.he}`, `Stone shifts: light, root, water.${opened.en}`) : this.result(`שלוש החותמות דולקות. ${this.missingClues().he} כשכל הרמזים ייאספו, הדלת תיפתח.`, `All three seals glow. ${this.missingClues().en} Once every clue is gathered, the door will open.`); }
        s.flags.sequenceLamp = false; s.flags.sequenceTree = false;
        return this.result('האבנים שוקעות בחזרה — הסדר לא נכון. הלוחות: I נר, II עץ, III גל. התחילו מחדש מהנר.', 'The stones sink back — wrong order. The panels say: I lamp, II tree, III wave. Start again with the lamp.');
      case 'openHidden':
        if (this.flag('hiddenOpened')) return this.result('המעבר כבר פתוח. אפשר לחזור דרך האולמות.', 'The passage is already open. You can return through the halls.');
        if (!this.allInscriptions() || !this.flag('lightRevealed') || !this.mapComplete() || !this.flag('mechanismSolved') || s.phase < 2) return this.result(`הדלת לא זזה. ${this.missingClues().he}${this.flag('mechanismSolved') ? '' : ' וגם שלוש החותמות עוד כבויות.'}`, `The door will not move. ${this.missingClues().en}${this.flag('mechanismSolved') ? '' : ' And the three seals are still dark.'}`);
        this.mark('hiddenOpened'); s.phase = 3;
        return this.result('פרק שלישי · פרסות בחשכה. מכאן נפתח אגף בדיוני שאינו חלק מבית שערים האמיתית.', 'Chapter three · Hoofbeats in the dark. Beyond here lies a fictional annex, not part of real Beit She’arim.');
      case 'readExplorer':
        if (s.phase < 3) break;
        if (!this.flag('explorerRead')) { this.mark('explorerRead'); this.add('explorer_note'); }
        return this.result('היומן נשמר. הישארו בתנועה במהלך ההסתערות; העמודים מספקים מחסה.', 'Journal saved. Keep moving during the charge; the pillars provide cover.');
      case 'faceGuardian':
        if (s.phase !== 3 || !this.flag('explorerRead')) return this.result('קראו תחילה את יומן החוקר שנשאר באגף.', 'First read the explorer’s journal left in the annex.');
        if (s.encounter.survived || s.encounter.active) break;
        this.mark('guardianSeen'); s.encounter.active = true; s.encounter.timer = 0; s.encounter.hits = 0;
        return this.result('ההסתערות החלה. התחמקו והשתמשו בעמודים במשך 20 שניות. הרוח אינה מחפשת מלחמה חדשה.', 'The charge begins. Evade and use pillars for 20 seconds. The spirit does not need another battle.');
      case 'collect_memory_lantern': case 'collect_memory_photo': case 'collect_memory_letter': {
        if (!s.encounter.survived || s.phase < 3) return this.result('תחילה שרדו את המפגש עם השומר.', 'First survive the guardian encounter.');
        const id = action.slice(8); const key = ({ memory_lantern: 'lanternFound', memory_photo: 'photoFound', memory_letter: 'letterFound' } as Record<string, string>)[id];
        if (!this.flag(key)) { this.mark(key); this.add(id); }
        s.encounter.memories = ['lanternFound', 'photoFound', 'letterFound'].filter(k => this.flag(k)).length;
        if (s.encounter.memories === 3) {
          this.mark('identityRevealed');
          return this.result('הזיכרונות מצטרפים: השומר הוא אלכסנדר זייד. זכרו ההיסטורי אמיתי; סיפור הרוח בדיוני. השיבו לו את האנשים, את המקום ואת הזיכרון, בסדר הזה.', 'The memories connect: the guardian is Alexander Zeid. His historical legacy is real; the ghost story is fictional. Restore the people, the place, and the memory to him, in that order.');
        }
        return this.result('הזיכרון נאסף. יש עוד קולות שחסרים בסיפור.', 'Memory recovered. More voices are still missing from the story.');
      }
      case 'oathPeople': case 'oathPlace': case 'oathMemory':
        if (!this.flag('identityRevealed') || this.flag('spiritFreed')) break;
        if (action === 'oathPeople' && !this.flag('oathPeople')) { s.flags.oathPeople = true; return this.result('״הפנס היה בשביל אנשים שיחזרו הביתה.״ עכשיו הזכירו את המקום.', '“The lantern was for people finding their way home.” Now recall the place.'); }
        if (action === 'oathPlace' && this.flag('oathPeople') && !this.flag('oathPlace')) { s.flags.oathPlace = true; return this.result('״העמק היה בית, לא שדה קרב נצחי.״ עכשיו הזכירו את הזיכרון.', '“The valley was a home, not an endless battlefield.” Now recall the memory.'); }
        if (action === 'oathMemory' && this.flag('oathPeople') && this.flag('oathPlace')) {
          this.mark('spiritFreed'); s.phase = 4; s.encounter.active = false; s.wakefulness = 100; s.intoxication = 0;
          return this.result('״אתם תשמרו את הסיפור. אני יכול להניח לשמירה.״ הרוח נרגעת. ארכיון העמק נפתח.', '“You will keep the story. I can set down the watch.” The spirit finds peace. The valley archive opens.');
        }
        s.flags.oathPeople = false; s.flags.oathPlace = false;
        return this.result('הרוח אינה מבינה עדיין. חזרו בעדינות: האנשים, המקום, ואז הזיכרון.', 'The spirit does not yet understand. Begin gently again: the people, the place, then the memory.');
      case 'openTreasure':
        if (!this.flag('spiritFreed')) break;
        if (!this.flag('treasureFound')) { this.mark('treasureFound'); this.add('valley_archive'); }
        return this.result('האוצר תועד לשימור. לכו לתצפית: אור ראשון כבר עולה מעל העמק.', 'The treasure is documented for preservation. Walk to the overlook: first light is rising above the valley.');
      case 'finish':
        if (!this.flag('treasureFound')) break;
        this.mark('ending'); this.save();
        return this.result('טבעון - GTA · תודה ששמרתם את הסיפור. תוכלו להמשיך לטייל ולחזור לעיירה.', 'Tivon - GTA · Thank you for keeping the story. You may keep exploring and return to town.');
    }
    return this.result('אין פעולה נוספת כרגע.', 'There is nothing more to do here right now.');
  }

  tick(dt: number, sprinting = false): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 60);
    const s = this.state;
    s.elapsed += dt;
    s.wakefulness = Math.max(0, s.wakefulness - dt * (1 / 24 + (sprinting ? 0.04 : 0)));
    s.intoxication = Math.max(0, s.intoxication - dt * 0.035);
    if (s.flashlightOn) {
      s.battery = Math.max(0, s.battery - dt / 15);
      if (s.battery === 0) { s.flashlightOn = false; this.remember(tx('הפנס כבה. החליפו סוללה במלאי.', 'The flashlight went out. Replace its battery from inventory.')); }
    }
    if (s.brewing > 0) {
      s.brewing = Math.max(0, s.brewing - dt);
      if (s.brewing === 0) { this.add('coffee'); this.mark('coffeeBrewed'); this.remember(tx('הקפה מוכן ונוסף למלאי. I פותח את המלאי לשתייה.', 'Coffee is ready and added to inventory. Press I to drink it.')); }
    }
    if (s.encounter.active) {
      s.encounter.timer = Math.min(20, s.encounter.timer + dt);
      if (s.encounter.timer >= 20) {
        s.encounter.active = false; s.encounter.survived = true; this.mark('firstConfrontationSurvived');
        this.remember(tx('ההסתערות נחלשת. חפשו את שלושת חפצי הזיכרון.', 'The charge subsides. Seek the three memory objects.'));
      }
    }
  }
  save(): boolean {
    try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); return true; }
    catch { return false; }
  }
  static load(): GameState | null {
    try { if (typeof localStorage === 'undefined') return null; const raw = localStorage.getItem(SAVE_KEY); return raw ? normalize(JSON.parse(raw)) : null; }
    catch { return null; }
  }
}
