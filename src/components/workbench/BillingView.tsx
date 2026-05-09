import React, { useEffect, useState, useRef } from 'react';
import { billingApi } from '../../services/billing';
import { AppDialog } from '../common/AppDialog';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { formatCreditAmount, formatSignedCreditAmount } from '../../utils/credits';
import { PromoBanner } from '../promo/PromoBanner';
import { usePromoEligibility } from '../promo/usePromoEligibility';

const ACTIVE_PROMO_CAMPAIGN_ID = 'promo_39_9_598v';

export const BillingView: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  
  // Dialog controls
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);

  // Payment State
  const [showPayQR, setShowPayQR] = useState(false);
  const [payOrder, setPayOrder] = useState<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redeem code state
  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);

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
    if (user) loadData();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [user]);

  const startPolling = (outTradeNo: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    
    pollingRef.current = setInterval(async () => {
      try {
        const res = await billingApi.getRechargeStatus(outTradeNo);
        if (res?.code === 0 && res.data.status === 'PAID') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setShowPayQR(false);
          await loadData();
          openInfo(t.billing_recharge_success || 'Payment received successfully!', '');
        } else if (res?.code === 0 && (res.data.status === 'CANCELLED' || res.data.status === 'FAILED')) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setShowPayQR(false);
          openInfo(t.billing_recharge_failed || 'Payment failed or cancelled.', `Order status: ${res.data.status}`);
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 3000);
  };

  const handleRecharge = async (amount: number, campaignId?: string) => {
    try {
      setLoading(true);
      const res = await billingApi.createRecharge(amount, campaignId);

      const payParams = res?.data?.pay_params;
      const order = res?.data?.order;

      if (payParams?.code_url) {
        setPayOrder({
          amount: order.amount / 100, // fen to yuan
          out_trade_no: order.out_trade_no,
          code_url: payParams.code_url
        });
        setShowPayQR(true);
        startPolling(order.out_trade_no);
      } else {
        openInfo('Payment Error', t.billing_pay_error || 'Failed to get WeChat Pay QR code. Please check payment config and retry.');
      }
    } catch (err: any) {
      openInfo('Error', err?.message || 'Recharge failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async () => {
    const code = redeemCodeInput.trim();
    if (!code) {
      openInfo(t.billing_redeem_title || 'Redeem Code', t.billing_redeem_placeholder || 'Please enter a redeem code');
      return;
    }
    try {
      setRedeemLoading(true);
      await billingApi.redeemCode(code);
      setRedeemCodeInput('');
      await loadData();
      openInfo(t.billing_redeem_title || 'Redeem Code', t.billing_redeem_success || 'Redeem successful! Credits added.');
    } catch (err: any) {
      openInfo(t.billing_redeem_title || 'Redeem Code', err?.message || 'Redeem failed');
    } finally {
      setRedeemLoading(false);
    }
  };

  // 限时活动 banner + hash 触发
  const promoEligibility = usePromoEligibility(ACTIVE_PROMO_CAMPAIGN_ID);
  const promoCampaign = promoEligibility.campaign;

  const triggerPromoPurchase = React.useCallback(() => {
    if (!promoCampaign || !promoCampaign.canPurchase) return;
    const amount = parseFloat(promoCampaign.amountYuan);
    if (!Number.isFinite(amount) || amount <= 0) return;
    void handleRecharge(amount, promoCampaign.id);
  }, [promoCampaign]);

  // 弹窗的"立即抢购"通过 URL hash promo_purchase=<id> 通知 BillingView 触发流程，
  // 这样 Workbench / BillingView 不必直接共享 handleRecharge 引用。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const consumeHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      const m = hash.match(/promo_purchase=([^&]+)/);
      if (!m) return;
      const requestedId = decodeURIComponent(m[1] || '');
      if (!requestedId) return;
      // 清掉 hash，避免回退 / 刷新时重复触发
      try {
        const url = window.location.href.replace(/#[^?]*$/, '');
        window.history.replaceState({}, '', url);
      } catch {
        window.location.hash = '';
      }
      // 等 promoCampaign 加载好再触发
      if (promoCampaign && promoCampaign.id === requestedId && promoCampaign.canPurchase) {
        triggerPromoPurchase();
      }
    };
    consumeHash();
  }, [promoCampaign, triggerPromoPurchase]);

  const balance = overview?.balance ?? 0;
  const planMeta = overview?.plan_meta || {};
  // 快捷充值档位：金额（元）+ 对应 V 点 + 卡片图片路径。
  // V 点 = 金额 × 10（默认 CREDIT_EXCHANGE_RATE）。图片裁自设计稿，命名 tier_<V点>.png。
  const RECHARGE_TIERS: { yuan: number; vPoints: number; image: string }[] = [
    { yuan: 1, vPoints: 10, image: '/recharge-tiers/tier_10.png' },
    { yuan: 6, vPoints: 60, image: '/recharge-tiers/tier_60.png' },
    { yuan: 45, vPoints: 450, image: '/recharge-tiers/tier_450.png' },
    { yuan: 68, vPoints: 680, image: '/recharge-tiers/tier_680.png' },
    { yuan: 118, vPoints: 1180, image: '/recharge-tiers/tier_1180.png' },
    { yuan: 198, vPoints: 1980, image: '/recharge-tiers/tier_1980.png' },
    { yuan: 348, vPoints: 3480, image: '/recharge-tiers/tier_3480.png' },
    { yuan: 648, vPoints: 6480, image: '/recharge-tiers/tier_6480.png' },
    { yuan: 898, vPoints: 8980, image: '/recharge-tiers/tier_8980.png' },
    { yuan: 1298, vPoints: 12980, image: '/recharge-tiers/tier_12980.png' },
  ];
  const CUSTOM_AMOUNT_MIN = 1;
  const CUSTOM_AMOUNT_MAX = 10000;
  const [customAmountInput, setCustomAmountInput] = useState<string>('');
  const [customAmountError, setCustomAmountError] = useState<string>('');

  const handleCustomRecharge = () => {
    setCustomAmountError('');
    const raw = customAmountInput.trim();
    if (!raw) {
      setCustomAmountError(((t as any).billing_custom_amount_required as string) || '请输入金额');
      return;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCustomAmountError(((t as any).billing_custom_amount_invalid as string) || '金额格式无效');
      return;
    }
    if (amount < CUSTOM_AMOUNT_MIN || amount > CUSTOM_AMOUNT_MAX) {
      const tpl = ((t as any).billing_custom_amount_range as string) || '金额需在 ¥{min} ~ ¥{max} 之间';
      setCustomAmountError(
        tpl.replace('{min}', String(CUSTOM_AMOUNT_MIN)).replace('{max}', String(CUSTOM_AMOUNT_MAX)),
      );
      return;
    }
    // 保留 2 位小数避免后端 quantize 失败
    const rounded = Math.round(amount * 100) / 100;
    void handleRecharge(rounded);
  };

  const getTxTypeLabel = (tx: any) => {
    const byType: Record<string, string> = {
      SYSTEM_GIFT: t.billing_tx_system_gift || 'System gift',
      RECHARGE: t.billing_tx_recharge || 'Recharge',
      GENERATION_COST: t.billing_tx_generation_cost || 'Generation cost',
      ASSET_COLLECT_COST: t.billing_tx_asset_collect_cost || 'Asset collect cost',
      REFUND: t.billing_tx_refund || 'Refund',
      REDEEM: t.billing_tx_redeem || 'Redeem',
    };

    const normalizedType = String(tx?.type || '').trim().toUpperCase();
    if (normalizedType && byType[normalizedType]) return byType[normalizedType];

    // Map raw Chinese labels from backend to i18n keys
    const rawLabel = String(tx?.type_label || '').trim();
    const rawMap: Record<string, string> = {
      '系统赠送': t.billing_tx_system_gift || 'System gift',
      '用户充值': t.billing_tx_recharge || 'Recharge',
      '微信支付充值': t.billing_tx_recharge || 'Recharge',
      '生成消耗': t.billing_tx_generation_cost || 'Generation cost',
      '素材收集消耗': t.billing_tx_asset_collect_cost || 'Asset collect cost',
      '失败退款': t.billing_tx_refund || 'Refund',
      '兑换码兑换': t.billing_tx_redeem || 'Redeem',
    };
    if (rawMap[rawLabel]) return rawMap[rawLabel];

    return rawLabel || '-';
  };

  const getTxDescriptionLabel = (tx: any) => {
    const meta = tx?.metadata && typeof tx.metadata === 'object' ? tx.metadata : null;
    const normalizedType = String(tx?.type || '').trim().toUpperCase();
    const mediaType = String((meta as any)?.media_type || '').trim().toLowerCase();
    if (normalizedType === 'GENERATION_COST') {
      if (mediaType === 'video') return t.billing_desc_video_generation || 'Video generation';
      if (mediaType === 'image') return t.billing_desc_image_generation || 'Image generation';
    }

    const raw = String(tx?.description || '').trim();
    if (!raw) return '-';

    const normalized = raw.replace(/\s+/g, '');
    const map: Record<string, string> = {
      '任务失败退款': t.billing_desc_task_refund_failed || 'Task failure refund',
      '脚本生成': t.billing_desc_script_generation || 'Script generation',
      '视频生成': t.billing_desc_video_generation || 'Video generation',
      '图片生成': t.billing_desc_image_generation || 'Image generation',
      '脚本生成失败退款': t.billing_desc_script_generation_refund || 'Script generation refund',
      '素材广场收集消耗': t.billing_desc_asset_collect || 'Asset plaza collect cost',
      '新用户赠送': t.billing_desc_new_user_gift || 'New user gift',
      '系统退款': t.billing_desc_system_refund || 'System refund',
      '生成消耗': t.billing_desc_generation_cost || 'Generation cost',
      '微信支付充值': t.billing_tx_recharge || 'Recharge',
    };

    return map[normalized] || raw;
  };

  const getTxMetaSummary = (tx: any) => {
    const meta = tx?.metadata && typeof tx.metadata === 'object' ? tx.metadata : null;
    if (!meta) return '';
    const mediaType = String((meta as any).media_type || '').trim().toLowerCase();
    const rawMode = String((meta as any).pricing_mode || '').trim();

    // Translate common Chinese mode values
    const modeMap: Record<string, string> = {
      'replay': t.billing_mode_replay || 'Viral Replay',
      'fast': t.billing_mode_fast || 'Fast Render',
      '爆款复刻': t.billing_mode_replay || 'Viral Replay',
      '极速出片': t.billing_mode_fast || 'Fast Render',
      'ai首帧图': t.billing_mode_fast || 'Fast Render',
    };
    const mode = modeMap[rawMode] || rawMode;

    const billingType = String((meta as any).billing_type || '').trim().toLowerCase();
    const model = String((meta as any).model_display_name || (meta as any).model || '').trim();
    const rawRateLabel = String((meta as any).rate_label || '').trim();
    // Translate rate label: "2V点/张" → "2 V-points/img", "3V点/秒" → "3 V-points/sec"
    const creditName = t.billing_credit_name || 'credits';
    const rateLabel = rawRateLabel
      .replace(/V点/g, creditName)
      .replace(/张$/,'')
      .replace(/秒$/,'')
      + (rawRateLabel.includes('张') ? `/${t.billing_unit_images || 'img'}` : '')
      + (rawRateLabel.includes('秒') ? `/${t.billing_unit_seconds || 'sec'}` : '');

    const billedUnits = Number((meta as any).billed_units || 0);
    const rateUnit = String((meta as any).rate_unit || '').trim().toLowerCase();
    const billedUnitsLabel = billedUnits > 0
      ? `${billedUnits}${rateUnit === 'second' ? (t.billing_unit_seconds || 'sec') : rateUnit === 'image' ? (t.billing_unit_images || 'img') : rateUnit}`
      : '';
    const videoCountRaw = Number((meta as any).video_count || (meta as any).task_count || 0);
    const videoCount = Number.isFinite(videoCountRaw) ? Math.max(0, Math.round(videoCountRaw)) : 0;
    const videoCountLabel = mediaType === 'video' && videoCount > 0 ? `${videoCount}${t.billing_unit_videos || 'video(s)'}` : '';
    const totalTokensRaw = Number((meta as any).total_tokens ?? (meta as any).usage?.total_tokens ?? 0);
    const totalTokens = Number.isFinite(totalTokensRaw) ? Math.max(0, Math.round(totalTokensRaw)) : 0;
    const resolution = String((meta as any).resolution || '').trim();
    const hasVideoInputRaw = (meta as any).has_video_input;
    const hasVideoInput = typeof hasVideoInputRaw === 'boolean'
      ? hasVideoInputRaw
      : ['true', '1', 'yes'].includes(String(hasVideoInputRaw || '').trim().toLowerCase());
    const hasVideoInputKnown = typeof hasVideoInputRaw === 'boolean' || String(hasVideoInputRaw || '').trim() !== '';
    const costRaw = Math.abs(Number(tx?.amount || 0)) || Number((meta as any).actual_cost || (meta as any).cost || 0);
    const cost = Number.isFinite(costRaw) ? Math.max(0, costRaw) : 0;
    const costLabel = formatCreditAmount(cost);
    const isSeedanceDelayed = billingType === 'seedance_delayed' || totalTokens > 0;
    if (isSeedanceDelayed) {
      const detailParts = [
        mode ? `${t.billing_meta_mode || 'Mode'}: ${mode}` : '',
        model ? `${t.billing_meta_model || 'Model'}: ${model}` : '',
        resolution ? `${t.billing_meta_resolution || 'Resolution'}: ${resolution}` : '',
        hasVideoInputKnown
          ? `${t.billing_meta_video_input || 'Video Input'}: ${hasVideoInput ? (t.billing_video_input_with || 'With') : (t.billing_video_input_without || 'Without')}`
          : '',
        totalTokens > 0 ? `${t.billing_meta_total_tokens || 'Total Tokens'}: ${totalTokens}` : '',
        cost > 0 ? `${t.billing_meta_actual_cost || t.billing_meta_cost || 'Actual Cost'}: ${costLabel} ${creditName}` : '',
      ].filter(Boolean);
      return detailParts.join(' | ');
    }
    const detailParts = [
      mode ? `${t.billing_meta_mode || 'Mode'}: ${mode}` : '',
      model ? `${t.billing_meta_model || 'Model'}: ${model}` : '',
      rateLabel ? `${t.billing_meta_rate || 'Rate'}: ${rateLabel}` : '',
      videoCountLabel ? `${t.billing_meta_count || 'Count'}: ${videoCountLabel}` : '',
      billedUnitsLabel ? `${t.billing_meta_unit || 'Billed'}: ${billedUnitsLabel}` : '',
      cost > 0 ? `${t.billing_meta_cost || 'Cost'}: ${costLabel} ${creditName}` : '',
    ].filter(Boolean);
    return detailParts.join(' | ');
  };

  if (!user) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 z-10 animate-in fade-in duration-300">
        <div className="text-zinc-500 text-4xl">💳</div>
        <p className="text-zinc-400 text-sm">{t.guest_billing_login_required || 'Log in to view billing and credits.'}</p>
        <button
          onClick={() => navigate('/login?returnUrl=/app')}
          className="px-5 py-2 rounded-lg bg-orange-600 text-white text-sm font-bold hover:bg-orange-500 transition"
        >
          {t.guest_login_button || 'Log In'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-sm relative z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {t.wb_nav_billing || 'Billing & Credits'}
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            {planMeta.description || t.billing_plan_description || 'Manage your plan, balance and top-ups.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-zinc-900/70 border border-white/10 text-xs text-zinc-300">
            {planMeta.name || overview?.tier_label || 'Plan'}
          </div>
          <div className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/40 text-xs text-orange-400 font-semibold">
            {t.billing_balance_label || 'Balance'}: {formatCreditAmount(balance)} {t.billing_credit_unit || 'credits'}
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-10 py-6 space-y-8">
        {promoEligibility.canShow && promoCampaign ? (
          <PromoBanner
            campaign={promoCampaign}
            onClick={triggerPromoPurchase}
          />
        ) : null}

        <section>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            {t.billing_recharge_title || 'Quick Recharge'}
          </h2>
          <div className="grid grid-cols-5 gap-3">
            {RECHARGE_TIERS.map((tier) => (
              <button
                key={tier.yuan}
                disabled={loading}
                onClick={() => handleRecharge(tier.yuan)}
                className="group flex flex-col items-stretch overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 transition hover:border-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`充值 ¥${tier.yuan} 得 ${tier.vPoints} V 点`}
              >
                <div className="aspect-square w-full overflow-hidden bg-black/30">
                  <img
                    src={tier.image}
                    alt={`${tier.vPoints} V`}
                    draggable={false}
                    className="block h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                </div>
                <div className="flex items-center justify-center border-t border-white/10 bg-zinc-950 py-2">
                  <span className="text-base font-bold text-zinc-100 group-hover:text-orange-400">
                    ¥{tier.yuan}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-300">
              {((t as any).billing_custom_amount_label as string) || '自定义金额：'}
            </span>
            <div className="inline-flex items-center rounded-xl border border-white/10 bg-zinc-900 overflow-hidden">
              <span className="px-3 text-sm text-zinc-400">¥</span>
              <input
                type="number"
                min={CUSTOM_AMOUNT_MIN}
                max={CUSTOM_AMOUNT_MAX}
                step="0.01"
                value={customAmountInput}
                onChange={(e) => {
                  setCustomAmountInput(e.target.value);
                  if (customAmountError) setCustomAmountError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !loading) handleCustomRecharge();
                }}
                placeholder={String(CUSTOM_AMOUNT_MIN) + ' ~ ' + String(CUSTOM_AMOUNT_MAX)}
                className="w-32 bg-transparent px-2 py-2 text-sm text-zinc-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleCustomRecharge}
              className="px-4 py-2 rounded-xl bg-orange-500 text-sm font-bold text-black hover:bg-orange-400 transition disabled:opacity-50"
            >
              {((t as any).billing_custom_amount_submit as string) || '充值'}
            </button>
            {customAmountError ? (
              <span className="text-xs text-red-400">{customAmountError}</span>
            ) : null}
          </div>

          <p className="text-xs text-zinc-500 mt-2">
            {t.billing_recharge_hint ||
              'Select an amount to recharge via WeChat Pay.'}
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            {t.billing_redeem_title || 'Redeem Code'}
          </h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={redeemCodeInput}
              onChange={(e) => setRedeemCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRedeem();
              }}
              placeholder={t.billing_redeem_placeholder || 'Enter redeem code'}
              disabled={redeemLoading}
              className="px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition disabled:opacity-50 w-64"
            />
            <button
              disabled={redeemLoading}
              onClick={handleRedeem}
              className="px-4 py-2 rounded-xl bg-orange-600 text-sm text-white font-semibold hover:bg-orange-500 transition disabled:opacity-50"
            >
              {redeemLoading ? '...' : (t.billing_redeem_button || 'Redeem')}
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            {t.billing_transactions_title || 'Recent Transactions'}
          </h2>
          <div className="rounded-2xl border border-white/5 bg-zinc-950/60 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 text-zinc-400">
                <tr>
                  <th className="px-4 py-2">{t.billing_col_type || 'Type'}</th>
                  <th className="px-4 py-2">{t.billing_col_amount || 'Amount'}</th>
                  <th className="px-4 py-2">{t.billing_col_description || 'Description'}</th>
                  <th className="px-4 py-2">{t.billing_col_time || 'Time'}</th>
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
                    <td className="px-4 py-2 text-zinc-300">{getTxTypeLabel(tx)}</td>
                    <td
                      className={`px-4 py-2 font-medium ${
                        Number(tx.amount || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatSignedCreditAmount(tx.amount)}
                    </td>
                    <td className="px-4 py-2 text-zinc-400">
                      <div>{getTxDescriptionLabel(tx)}</div>
                      {getTxMetaSummary(tx) ? (
                        <div className="mt-1 text-[10px] text-zinc-500">{getTxMetaSummary(tx)}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-zinc-400">
                      {tx.created_at?.replace('T', ' ').slice(0, 19)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Payment QR Modal */}
      {showPayQR && (
        <AppDialog
          isOpen={showPayQR}
          title={t.billing_qr_title || 'Scan to Pay'}
          onClose={() => {
            setShowPayQR(false);
            if (pollingRef.current) clearInterval(pollingRef.current);
          }}
        >
          <div className="flex flex-col items-center py-4 bg-white rounded-lg">
             <QRCodeSVG value={payOrder?.code_url} size={200} />
             <p className="mt-4 text-zinc-900 font-bold text-lg">¥{payOrder?.amount}</p>
             <p className="text-zinc-500 text-xs mt-1">{t.billing_qr_hint || 'Please use WeChat to scan the QR code'}</p>
             <p className="text-zinc-400 text-[10px] mt-2">{t.billing_qr_order_id || 'Order ID'}: {payOrder?.out_trade_no}</p>
          </div>
          <div className="mt-4 flex justify-center">
            <button 
               onClick={() => {
                 setShowPayQR(false);
                 if (pollingRef.current) clearInterval(pollingRef.current);
               }}
               className="text-zinc-400 hover:text-white text-xs underline"
            >
              {t.billing_qr_cancel || 'Cancel Payment'}
            </button>
          </div>
        </AppDialog>
      )}

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
              {t.btn_ok || 'OK'}
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

