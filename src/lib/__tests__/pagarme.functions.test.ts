import { describe, it, expect } from "vitest";
import { buildPagarmeBody, getPagarmeUrl, PAGARME_TEST_URL, PAGARME_PRODUCTION_URL } from "../pagarme.functions";

describe("Pagar.me Integration Helpers", () => {
  describe("buildPagarmeBody", () => {
    it("should include mandatory field type: 'order'", () => {
      const data = {
        name: "Test Payment",
        amount: 500,
        installments: 1,
        methods: ["credit_card"],
      };
      const body = buildPagarmeBody(data);
      expect(body.type).toBe("order");
    });

    it("should include is_building: false", () => {
      const data = {
        name: "Test Payment",
        amount: 500,
        installments: 1,
        methods: ["credit_card"],
      };
      const body = buildPagarmeBody(data);
      expect(body.is_building).toBe(false);
    });

    it("should truncate name to 64 characters", () => {
      const longName = "A".repeat(100);
      const data = {
        name: longName,
        amount: 500,
        installments: 1,
        methods: ["credit_card"],
      };
      const body = buildPagarmeBody(data);
      expect(body.name).toHaveLength(64);
    });

    it("should correctly structure installments for credit card", () => {
      const data = {
        name: "Test",
        amount: 1000,
        installments: 2,
        methods: ["credit_card"],
      };
      const body = buildPagarmeBody(data);
      const ccSettings = body.payment_settings.credit_card_settings;
      expect(ccSettings).toBeDefined();
      expect(ccSettings?.installments).toHaveLength(2);
      expect(ccSettings?.installments[0]).toEqual({ number: 1, total: 1000 });
      expect(ccSettings?.installments[1]).toEqual({ number: 2, total: 1000 });
    });
  });

  describe("getPagarmeUrl", () => {
    it("should return test URL for sk_test keys", () => {
      expect(getPagarmeUrl("sk_test_123456789")).toBe(PAGARME_TEST_URL);
    });

    it("should return production URL for sk_live keys", () => {
      expect(getPagarmeUrl("sk_live_123456789")).toBe(PAGARME_PRODUCTION_URL);
    });

    it("should default to production URL for other keys", () => {
      expect(getPagarmeUrl("any_other_key")).toBe(PAGARME_PRODUCTION_URL);
    });
  });
});
