import { describe, expect, it } from "vitest";
import { extractAmount, extractAmounts } from "./numbers";

describe("extractAmount", () => {
  const cases: [string, number][] = [
    ["340", 340],
    ["₹1,250", 1250],
    ["Ramesh ka ₹340 udhaar", 340],
    ["nahi, 430", 430],
    ["तीन सौ चालीस", 340],
    ["teen sau chaalis", 340],
    ["साढ़े सात सौ", 750],
    ["saadhe saat sau", 750],
    ["do hazaar", 2000],
    ["दो हज़ार", 2000],
    ["दो हजार पाँच सौ", 2500],
    ["sawa sau", 125],
    ["paune do sau", 175],
    ["dedh sau", 150],
    ["ek lakh", 100000],
    ["three-forty", 340],
    ["three forty", 340],
    ["three hundred forty", 340],
    ["three hundred and forty five", 345],
    ["two thousand", 2000],
    ["twenty five", 25],
    ["पैंसठ", 65],
    ["pachaas", 50],
    ["paanch sau rupaye", 500],
    ["5 sau", 500],
    ["२०० रुपये", 200],
    ["paanch rupaye", 5],
  ];
  for (const [text, want] of cases) {
    it(`${text} -> ${want}`, () => expect(extractAmount(text)).toBe(want));
  }

  it("returns null with no amount", () => {
    expect(extractAmount("Ramesh ka total kitna hai")).toBeNull();
    expect(extractAmount("ek baar aana")).toBeNull();
    expect(extractAmount("ke saath")).toBeNull();
  });
  it("returns null for two different amounts", () => {
    expect(extractAmount("Ramesh 340 aur Sita 200")).toBeNull();
    expect(extractAmounts("Ramesh 340 aur Sita 200")).toEqual([340, 200]);
  });
  it("same amount twice is one amount", () => {
    expect(extractAmount("340 hai, matlab teen sau chalis")).toBe(340);
  });
  it("amount inside a full sentence", () => {
    expect(extractAmount("Ramesh ka teen sau chalis udhaar likho")).toBe(340);
    expect(extractAmount("रमेश का तीन सौ चालीस उधार")).toBe(340);
  });
});

describe("full 1-99 tables", () => {
  const dev =
    "एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चौवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उनासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पंचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे".split(
      " ",
    );
  const roman =
    "ek do teen chaar paanch chhah saat aath nau das gyarah barah terah chaudah pandrah solah satrah atharah unnis bees ikkis baais teis chaubis pachchis chhabbis sattais atthais unatis tees ikattis battis taintis chauntis paintis chhattis saintis adtis unchalis chalis iktalis bayalis taintalis chauvalis paintalis chhiyalis saintalis adtalis unchas pachas ikyavan baavan tirpan chauvan pachpan chhappan sattavan atthavan unsath saath iksath baasath tirsath chaunsath painsath chhiyasath sadsath adsath unhattar sattar ikahattar bahattar tihattar chauhattar pachhattar chhihattar satahattar athahattar unyasi assi ikyasi bayasi tirasi chaurasi pachasi chhiyasi sattasi atthasi navasi nabbe ikyanve baanve tiranve chauranve panchanve chhiyanve sattanve atthanve ninyanve".split(
      " ",
    );
  it("has 99 entries each", () => {
    expect(dev).toHaveLength(99);
    expect(roman).toHaveLength(99);
  });
  it("Devanagari 1-99", () => {
    dev.forEach((w, i) => expect(extractAmount(`${w} रुपये`), w).toBe(i + 1));
  });
  it("romanised 1-99", () => {
    roman.forEach((w, i) => expect(extractAmount(`${w} rupaye`), w).toBe(i + 1));
  });
  it("tens before sau", () => {
    expect(extractAmount("पचहत्तर सौ")).toBe(7500);
  });
});
