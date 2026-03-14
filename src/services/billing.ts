const API_BASE_URL = '/api/billing';

function getCookie(name: string) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

export const billingApi = {
  listTransactions: async (limit = 20, offset = 0) => {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch(
      `${API_BASE_URL}/transactions/?limit=${limit}&offset=${offset}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrftoken || '',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
      }
    );

    if (!response.ok) {
      let errorMsg = 'Failed to load billing';
      try {
        const errData = await response.json();
        errorMsg = errData.message || JSON.stringify(errData);
      } catch (e) {
        errorMsg = `Server Error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  },
};
