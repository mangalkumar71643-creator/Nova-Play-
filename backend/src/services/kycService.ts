import { env } from "../config/env";

export interface KycSubmission {
  userId: string;
  documentType: string;
  documentReference: string;
}

export interface KycResult {
  provider: string;
  providerReferenceId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rawResult: unknown;
}

export interface KycProvider {
  readonly name: string;
  submit(submission: KycSubmission): Promise<KycResult>;
}

/**
 * Local-development stand-in only. It auto-approves everything and talks to
 * no external service. Swap in a real licensed KYC provider (Sumsub,
 * Onfido, ComplyAdvantage, ...) before accepting real users — see README.
 */
class MockKycProvider implements KycProvider {
  readonly name = "mock";

  async submit(submission: KycSubmission): Promise<KycResult> {
    return {
      provider: this.name,
      providerReferenceId: `mock_${submission.userId}_${Date.now()}`,
      status: "APPROVED",
      rawResult: { note: "Auto-approved by MockKycProvider (dev only)", submission },
    };
  }
}

/**
 * Placeholder for a real provider integration. Implement `submit` to call
 * your KYC vendor's API with credentials from environment variables, and
 * wire up their webhook to update KycVerification.status asynchronously.
 */
class LiveKycProvider implements KycProvider {
  readonly name = "live";

  async submit(_submission: KycSubmission): Promise<KycResult> {
    throw new Error(
      "LiveKycProvider is not implemented. Integrate a licensed KYC provider before setting KYC_PROVIDER_MODE=live."
    );
  }
}

export const kycProvider: KycProvider =
  env.kycProviderMode === "live" ? new LiveKycProvider() : new MockKycProvider();
