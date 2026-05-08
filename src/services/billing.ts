// src/services/billing.ts

import { apiRequest } from './apiClient';

const API_BASE_URL = '/api/billing';

export const billingApi = {
  listTransactions: async (limit = 20, offset = 0) => {
    return apiRequest(
      `${API_BASE_URL}/transactions/?limit=${limit}&offset=${offset}`,
      { fallbackMessage: 'Failed to load billing' },
    );
  },

  getOverview: async () => {
    return apiRequest(`${API_BASE_URL}/overview/`, {
      fallbackMessage: 'Failed to load billing overview',
    });
  },

  createRecharge: async (amount: number) => {
    return apiRequest(`${API_BASE_URL}/recharge/wechat/`, {
      method: 'POST',
      body: { amount },
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
    return apiRequest(`${API_BASE_URL}/redeem/`, {
      method: 'POST',
      body: { code },
      fallbackMessage: 'Redeem failed',
    });
  },
};
