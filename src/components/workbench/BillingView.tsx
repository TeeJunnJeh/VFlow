import React, { useEffect, useState } from 'react';
import { billingApi } from '../../services/billing';
import { AppDialog } from '../common/AppDialog';
import { useLanguage } from '../../context/LanguageContext';

export const BillingView: React.FC = () => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);

  const openInfo = (title: string, message: string) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setIsDialogOpen(true);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [overviewRes, txRes] = await Promise.all([
        billingApi.getOverview(),
        billingApi.listTransactions(20, 0),
      ]);
      setOverview(overviewRes?.data || null);
      const items = txRes?.data?.items;
      setTransactions(Array.isArray(items) ? items : []);
    } catch (err: any) {
      openInfo('Error', err?.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRecharge = async (amount: number) => {
    try {
      setLoading(true);
      await billingApi.createRecharge(amount);
      await loadData();
      openInfo('Success', `${amount} 元充值成功（当前为模拟自动成功模式）`);
    } catch (err: any) {
      openInfo('Error', err?.message || 'Recharge failed');
    } finally {
      setLoading(false);
    }
  };

  const balance = overview?.balance ?? 0;
  const planMeta = overview?.plan_meta || {};

  const getTxTypeLabel = (tx: any) => {
    const byType: Record<string, string> = {
      SYSTEM_GIFT: t.billing_tx_system_gift || 'System gift',
      RECHARGE: t.billing_tx_recharge || 'Recharge',
      GENERATION_COST: t.billing_tx_generation_cost || 'Generation cost',
      ASSET_COLLECT_COST: t.billing_tx_asset_collect_cost || 'Asset collect cost',
      REFUND: t.billing_tx_refund || 'Refund',
    };

    const normalizedType = String(tx?.type || '').trim().toUpperCase();
    if (normalizedType && byType[normalizedType]) return byType[normalizedType];

    const rawLabel = String(tx?.type_label || '').trim();
    if (rawLabel === '系统赠送') return t.billing_tx_system_gift || 'System gift';
    if (rawLabel === '用户充值') return t.billing_tx_recharge || 'Recharge';
    if (rawLabel === '生成消耗') return t.billing_tx_generation_cost || 'Generation cost';
    if (rawLabel === '素材收集消耗') return t.billing_tx_asset_collect_cost || 'Asset collect cost';
    if (rawLabel === '失败退款') return t.billing_tx_refund || 'Refund';

    return rawLabel || '-';
  };

  const getTxDescriptionLabel = (tx: any) => {
    const raw = String(tx?.description || '').trim();
    if (!raw) return '-';

    const normalized = raw.replace(/\s+/g, '');
    const map: Record<string, string> = {
      '任务失败退款': t.billing_desc_task_refund_failed || 'Task failure refund',
      '脚本生成': t.billing_desc_script_generation || 'Script generation',
      '视频生成': t.billing_desc_video_generation || 'Video generation',
      '脚本生成失败退款': t.billing_desc_script_generation_refund || 'Script generation refund',
      '素材广场收集消耗': t.billing_desc_asset_collect || 'Asset plaza collect cost',
      '新用户赠送': t.billing_desc_new_user_gift || 'New user gift',
      '系统退款': t.billing_desc_system_refund || 'System refund',
      '生成消耗': t.billing_desc_generation_cost || 'Generation cost',
    };

    return map[normalized] || raw;
  };

  return (
    <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {t.wb_nav_billing || 'Billing & Credits'}
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            {planMeta.description || 'Manage your plan, balance and top-ups.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-zinc-900/70 border border-white/10 text-xs text-zinc-300">
            {planMeta.name || overview?.tier_label || 'Plan'}
          </div>
          <div className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/40 text-xs text-orange-400 font-semibold">
            {t.billing_balance_label || 'Balance'}: {balance} {t.billing_credit_unit || 'credits'}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-10 py-6 space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            {t.billing_recharge_title || 'Quick Recharge'}
          </h2>
          <div className="flex flex-wrap gap-3">
            {[9, 29, 99, 199].map((amt) => (
              <button
                key={amt}
                disabled={loading}
                onClick={() => handleRecharge(amt)}
                className="px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-100 hover:border-orange-500 hover:text-orange-400 transition disabled:opacity-50"
              >
                ¥{amt}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {t.billing_recharge_hint ||
              'Current environment uses mock mode: balance will update immediately after clicking.'}
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            {t.billing_transactions_title || 'Recent Transactions'}
          </h2>
          <div className="rounded-2xl border border-white/5 bg-zinc-950/60 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 text-zinc-400">
                <tr>
                  <th className="px-4 py-2">{t.billing_col_time || 'Time'}</th>
                  <th className="px-4 py-2">{t.billing_col_type || 'Type'}</th>
                  <th className="px-4 py-2">{t.billing_col_amount || 'Amount'}</th>
                  <th className="px-4 py-2">{t.billing_col_description || 'Description'}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-4 text-center text-zinc-500"
                    >
                      {t.billing_empty || 'No transactions yet.'}
                    </td>
                  </tr>
                )}
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-white/5">
                    <td className="px-4 py-2 text-zinc-400">
                      {tx.created_at?.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="px-4 py-2 text-zinc-300">{getTxTypeLabel(tx)}</td>
                    <td
                      className={`px-4 py-2 font-medium ${
                        tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                    </td>
                    <td className="px-4 py-2 text-zinc-400">
                      {getTxDescriptionLabel(tx)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {isDialogOpen && (
        <AppDialog
          isOpen={isDialogOpen}
          title={dialogTitle || 'Notice'}
          onClose={() => setIsDialogOpen(false)}
          footer={
            <button
              className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-700"
              onClick={() => setIsDialogOpen(false)}
            >
              OK
            </button>
          }
        >
          <div className="whitespace-pre-line text-sm text-zinc-300">
            {dialogMessage}
          </div>
        </AppDialog>
      )}
    </div>
  );
}

