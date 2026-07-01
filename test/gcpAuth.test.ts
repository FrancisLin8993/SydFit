import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";

const mockGetIdTokenClient = mock.fn();
mock.module("google-auth-library", {
	exports: {
		GoogleAuth: class {
			getIdTokenClient = mockGetIdTokenClient;
		},
	},
});

const mockWriteLog = mock.fn();
mock.module("../src/utils/logger.js", {
	exports: { writeLog: mockWriteLog },
});

describe("gcpAuth", () => {
	let getGcpAuthHeaders: any;

	before(async () => {
		({ getGcpAuthHeaders } = await import("../src/services/gcpAuth.js"));
	});

	beforeEach(() => {
		mockGetIdTokenClient.mock.resetCalls();
		mockWriteLog.mock.resetCalls();
	});

	it("flattens Headers-like (forEach) objects and logs INFO when Authorization is present", async () => {
		const headers = new Map([
			["Authorization", "Bearer abc"],
			["X-Other", "value"],
		]);
		mockGetIdTokenClient.mock.mockImplementationOnce(async () => ({
			getRequestHeaders: async () => headers,
		}));

		const result = await getGcpAuthHeaders("https://target.test");

		assert.deepEqual(result, {
			Authorization: "Bearer abc",
			"X-Other": "value",
		});
		assert.equal(mockWriteLog.mock.calls[0].arguments[0], "INFO");
	});

	it("flattens plain-object headers and accepts lowercase authorization", async () => {
		mockGetIdTokenClient.mock.mockImplementationOnce(async () => ({
			getRequestHeaders: async () => ({ authorization: "Bearer xyz" }),
		}));

		const result = await getGcpAuthHeaders("https://target.test");

		assert.deepEqual(result, { authorization: "Bearer xyz" });
		assert.equal(mockWriteLog.mock.calls[0].arguments[0], "INFO");
	});

	it("logs a WARNING but still returns headers when no Authorization key is present", async () => {
		mockGetIdTokenClient.mock.mockImplementationOnce(async () => ({
			getRequestHeaders: async () => ({ "X-Other": "value" }),
		}));

		const result = await getGcpAuthHeaders("https://target.test");

		assert.deepEqual(result, { "X-Other": "value" });
		assert.equal(mockWriteLog.mock.calls[0].arguments[0], "WARNING");
	});

	it("returns an empty object and logs ERROR when the auth client throws", async () => {
		mockGetIdTokenClient.mock.mockImplementationOnce(async () => {
			throw new Error("no credentials found");
		});

		const result = await getGcpAuthHeaders("https://target.test");

		assert.deepEqual(result, {});
		assert.equal(mockWriteLog.mock.calls[0].arguments[0], "ERROR");
	});
});
