import {
  qrPayloadWifi,
  qrPayloadVCard,
  qrPayloadMailto,
  qrPayloadSms,
  qrPayloadTel,
  qrPayloadGeo,
} from "./qrPayloads";

describe("qrPayloadWifi", () => {
  test("WPA with password + hidden", () => {
    expect(
      qrPayloadWifi({ ssid: "Home", password: "hunter2", hidden: true }),
    ).toBe("WIFI:T:WPA;S:Home;P:hunter2;H:true;;");
  });

  test("nopass omits password even if supplied", () => {
    expect(
      qrPayloadWifi({ ssid: "Cafe", encryption: "nopass", password: "ignored" }),
    ).toBe("WIFI:T:nopass;S:Cafe;;");
  });

  test("WEP without password", () => {
    expect(qrPayloadWifi({ ssid: "Old", encryption: "WEP" })).toBe(
      "WIFI:T:WEP;S:Old;;",
    );
  });

  test("escapes special chars in ssid and password", () => {
    expect(
      qrPayloadWifi({
        ssid: "a;b,c:d\\e\"f",
        password: "p;w",
      }),
    ).toBe("WIFI:T:WPA;S:a\\;b\\,c\\:d\\\\e\\\"f;P:p\\;w;;");
  });

  test("rejects empty ssid", () => {
    expect(() => qrPayloadWifi({ ssid: "" })).toThrow(/ssid/);
  });

  test("hidden omitted when false", () => {
    expect(qrPayloadWifi({ ssid: "Net", password: "x", hidden: false })).toBe(
      "WIFI:T:WPA;S:Net;P:x;;",
    );
  });
});

describe("qrPayloadVCard", () => {
  test("minimal: fullName only", () => {
    expect(qrPayloadVCard({ fullName: "Ada Lovelace" })).toBe(
      ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace", "END:VCARD"].join("\r\n"),
    );
  });

  test("name structured fields", () => {
    const out = qrPayloadVCard({
      fullName: "Ada Lovelace",
      name: { family: "Lovelace", given: "Ada" },
    });
    expect(out).toContain("N:Lovelace;Ada;;;");
    expect(out).toContain("FN:Ada Lovelace");
  });

  test("multi phone + email arrays each get their own line", () => {
    const out = qrPayloadVCard({
      fullName: "X",
      phone: ["+15551111", "+15552222"],
      email: ["a@b.com", "c@d.com"],
    });
    expect(out.split("\r\n")).toEqual([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:X",
      "TEL:+15551111",
      "TEL:+15552222",
      "EMAIL:a@b.com",
      "EMAIL:c@d.com",
      "END:VCARD",
    ]);
  });

  test("escapes commas, semicolons, backslashes, newlines", () => {
    const out = qrPayloadVCard({
      fullName: "Smith, John; Jr.",
      note: "line1\nline2\\back",
    });
    expect(out).toContain("FN:Smith\\, John\\; Jr.");
    expect(out).toContain("NOTE:line1\\nline2\\\\back");
  });

  test("address fields", () => {
    const out = qrPayloadVCard({
      fullName: "X",
      address: { street: "1 Way", city: "Town", postal: "12345" },
    });
    expect(out).toContain("ADR:;;1 Way;Town;;12345;");
  });

  test("rejects empty fullName", () => {
    expect(() => qrPayloadVCard({ fullName: "" })).toThrow(/fullName/);
  });
});

describe("qrPayloadMailto", () => {
  test("to only", () => {
    expect(qrPayloadMailto({ to: "a@b.com" })).toBe("mailto:a@b.com");
  });

  test("subject + body URL-encoded", () => {
    expect(
      qrPayloadMailto({
        to: "a@b.com",
        subject: "Hello world",
        body: "Line 1\nLine 2 & more",
      }),
    ).toBe(
      "mailto:a@b.com?subject=Hello%20world&body=Line%201%0ALine%202%20%26%20more",
    );
  });

  test("cc + bcc", () => {
    expect(
      qrPayloadMailto({ to: "a@b.com", cc: "c@d.com", bcc: "e@f.com" }),
    ).toBe("mailto:a@b.com?cc=c%40d.com&bcc=e%40f.com");
  });

  test("empty string values are still emitted", () => {
    // explicit empty subject is a legitimate user intent
    expect(qrPayloadMailto({ to: "a@b.com", subject: "" })).toBe(
      "mailto:a@b.com?subject=",
    );
  });

  test("rejects empty to", () => {
    expect(() => qrPayloadMailto({ to: "" })).toThrow(/to/);
  });
});

describe("qrPayloadTel + qrPayloadSms", () => {
  test("tel strips visual separators, keeps leading +", () => {
    expect(qrPayloadTel({ phone: "+1 (555) 123-4567" })).toBe("tel:+15551234567");
  });

  test("tel without + prefix preserved as plain digits", () => {
    expect(qrPayloadTel({ phone: "555.123.4567" })).toBe("tel:5551234567");
  });

  test("tel rejects empty / non-numeric", () => {
    expect(() => qrPayloadTel({ phone: "" })).toThrow(/digits/);
    expect(() => qrPayloadTel({ phone: "abc" })).toThrow(/digits/);
  });

  test("sms with body URL-encodes", () => {
    expect(
      qrPayloadSms({ phone: "+15551234567", body: "Hey there!" }),
    ).toBe("sms:+15551234567?body=Hey%20there!");
  });

  test("sms without body", () => {
    expect(qrPayloadSms({ phone: "5551234567" })).toBe("sms:5551234567");
  });
});

describe("qrPayloadGeo", () => {
  test("lat + lng", () => {
    expect(qrPayloadGeo({ lat: 37.786971, lng: -122.399677 })).toBe(
      "geo:37.786971,-122.399677",
    );
  });

  test("with altitude", () => {
    expect(qrPayloadGeo({ lat: 1, lng: 2, altitude: 100 })).toBe(
      "geo:1,2,100",
    );
  });

  test("with query label", () => {
    expect(qrPayloadGeo({ lat: 1, lng: 2, query: "Eiffel Tower" })).toBe(
      "geo:1,2?q=Eiffel%20Tower",
    );
  });

  test("rejects non-finite coords", () => {
    expect(() => qrPayloadGeo({ lat: NaN, lng: 0 })).toThrow(/lat/);
    expect(() => qrPayloadGeo({ lat: 0, lng: Infinity })).toThrow(/lng/);
    expect(() => qrPayloadGeo({ lat: 0, lng: 0, altitude: NaN })).toThrow(/altitude/);
  });
});
