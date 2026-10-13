import { env } from "../config/env";

export interface DepositRequest {
  userId: string;
  amount: number;
  currency: string;
}

export interface WithdrawalRequest {
  userId: string;
  amount: number;
  currency: string;
}

export interface PaymentResult {
  provider: string;
  providerReferenceId: string;
  status: "COMPLETED" | "PENDING" | "FAILED";
}

export interface PaymentProvider {
  readonly name: string;
  deposit(request: DepositRequest): Promise<PaymentResult>;
  withdraw(request: WithdrawalRequest): Promise<PaymentResult>;
}

/**
 * Local-development stand-in only — no real money moves. Standard payment
 * processors (Stripe, Razorpay, etc.) forbid gambling in their terms of
 * service; you need a processor licensed for gambling transactions before
 * going live. See README.
 */
class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async deposit(request: DepositRequest): Promise<PaymentResult> {
    return {
      provider: this.name,
      providerReferenceId: `mock_dep_${request.userId}_${Date.now()}`,
      status: "COMPLETED",
    };
  }

  async withdraw(request: WithdrawalRequest): Promise<PaymentResult> {
    return {
      provider: this.name,
      providerReferenceId: `mock_wd_${request.userId}_${Date.now()}`,
      status: "COMPLETED",
    };
  }
}

/** Placeholder — implement against a real, gambling-licensed processor. */
class LivePaymentProvider implements PaymentProvider {
  readonly name = "live";

  async deposit(_request: DepositRequest): Promise<PaymentResult> {
    throw new Error(
      "LivePaymentProvider is not implemented. Integrate a gambling-licensed payment processor before setting PAYMENT_PROVIDER_MODE=live."
    );
  }

  async withdraw(_request: WithdrawalRequest): Promise<PaymentResult> {
    throw new Error(
      "LivePaymentProvider is not implemented. Integrate a gambling-licensed payment processor before setting PAYMENT_PROVIDER_MODE=live."
    );
  }
}

export const paymentProvider: PaymentProvider =
  env.paymentProviderMode === "live" ? new LivePaymentProvider() : new MockPaymentProvider();
