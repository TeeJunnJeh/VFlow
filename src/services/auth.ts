// src/services/auth.ts

const API_BASE_URL = 'http://1.95.137.119:8001/api/auth';

export const authApi = {
  // 1. 发送验证码
  sendCode: async (phoneNumber: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/send-code/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 注意：这里必须改写成 "phone"，与你的接口文档截图一致
        body: JSON.stringify({ phone: phoneNumber }),
      });

      if (!response.ok) {
        // 400 错误时，尝试解析后端返回的错误详情
        const errorData = await response.json();
        throw new Error(errorData.message || '发送失败，请检查手机号格式');
      }
      return await response.json();
    } catch (error) {
      throw error;
    }
  },

  // 2. 验证并登录
  loginWithPhone: async (phoneNumber: string, code: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 同理，请确认登录接口的键名是 phone 还是 phone_number
        // 如果文档也是 "phone"，这里也要改
        body: JSON.stringify({
          phone: phoneNumber,
          code: code
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '验证码错误或登录失败');
      }
      return await response.json();
    } catch (error) {
      throw error;
    }
  }
};