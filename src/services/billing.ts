// src/services/billing.ts

import { apiRequest } from './apiClient';

const API_BASE_URL = '/api/billing';
const OVERVIEW_CACHE_TTL_MS = 30_000;

let overviewCache: { value: any; expiresAt: number } | null = null;
let overviewRequest: Promise<any> | null = null;

const clearOverviewCache = () => {
  overviewCache = null;
  overviewRequest = null;
};

export const billingApi = {
  listTransactions: async (limit = 20, offset = 0) => {
    return apiRequest(
      `${API_BASE_URL}/transactions/?limit=${limit}&offset=${offset}`,
      { fallbackMessage: 'Failed to load billing' },
    );
  },

  getOverview: async (options?: { force?: boolean }) => {
    const now = Date.now();
    if (!options?.force && overviewCache && overviewCache.expiresAt > now) {
      return overviewCache.value;
    }
    if (!options?.force && overviewRequest) {
      return overviewRequest;
    }

    overviewRequest = apiRequest(`${API_BASE_URL}/overview/`, {
      fallbackMessage: 'Failed to load billing overview',
    })
      .then((res) => {
        overviewCache = {
          value: res,
          expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS,
        };
        return res;
      })
      .finally(() => {
        overviewRequest = null;
      });

    return overviewRequest;
  },

  createRecharge: async (amount: number, campaignId?: string) => {
    clearOverviewCache();
    return apiRequest(`${API_BASE_URL}/recharge/wechat/`, {
      method: 'POST',
      body: campaignId ? { amount, campaign_id: campaignId } : { amount },
      fallbackMessage: 'Recharge failed',
    });
  },

  getRechargeStatus: async (outTradeNo: string) => {
    try {
      return await apiRequest(`${API_BASE_URL}/recharge/${outTradeNo}/status/`, {
        fallbackMessage: 'Failed to check recharge status',
      });
    } catch {
      // 原逻辑: 失败时返回 null 而不是抛错
      return null;
    }
  },

  redeemCode: async (code: string) => {
    clearOverviewCache();
    return apiRequest(`${API_BASE_URL}/redeem/`, {
      method: 'POST',
      body: { code },
      fallbackMessage: 'Redeem failed',
    }).finally(clearOverviewCache);
  },
};
