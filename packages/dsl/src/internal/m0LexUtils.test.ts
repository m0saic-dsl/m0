import { enclosureCloseFor, findMatchingClose, getNextToken } from "./m0LexUtils";

describe("m0LexUtils", () => {
  test('getNextToken("12(1,1)") === "12"', () => {
    expect(getNextToken("12(1,1)")).toBe("12");
  });

  test('getNextToken("0{1}") === "0"', () => {
    expect(getNextToken("0{1}")).toBe("0");
  });

  test('getNextToken("{1}") === "{"', () => {
    expect(getNextToken("{1}")).toBe("{");
  });

  test('findMatchingClose("1,2),3", "(") === 3', () => {
    expect(findMatchingClose("1,2),3", "(")).toBe(3);
  });

  test('enclosureCloseFor("{") === "}"', () => {
    expect(enclosureCloseFor("{")).toBe("}");
  });
});
