import React, { useState, useEffect, useRef } from 'react';
import { Loader2, X, CheckCircle2, AlertCircle, Check } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { authApi, type InviterPreview } from '../services/auth';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import { AppDialog } from '../components/common/AppDialog';
import { InviteCodeField } from '../components/common/InviteCodeField';
import { isStrongPassword } from '../utils/passwordRules';

const PENDING_INVITE_CODE_KEY = 'vflow_pending_invite_code';

const readPendingInviteCode = (): string => {
  try {
    return (sessionStorage.getItem(PENDING_INVITE_CODE_KEY) || '').trim();
  } catch {
    return '';
  }
};

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, user, isLoading } = useAuth();
  const { t } = useLanguage();

  // Safe returnUrl: must be a relative path starting with '/' to prevent open redirect
  const rawReturnUrl = searchParams.get('returnUrl') || '';
  const safeReturnUrl = rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//') ? rawReturnUrl : '/app';

  // --- 业务状态 ---
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [authMode, setAuthMode] = useState<'phone' | 'password'>('phone');
  const [isRegister, setIsRegister] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // --- UI 交互状态 ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isLoginSuccess, setIsLoginSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [hasAcceptedAgreement, setHasAcceptedAgreement] = useState(false);
  const [showAgreementError, setShowAgreementError] = useState(false);

  // 主表单上的"有邀请码？"输入，初始值取 sessionStorage（URL 捕获），允许用户手动粘贴/修改
  const [inlineInviteCode, setInlineInviteCode] = useState<string>(() => readPendingInviteCode());

  // --- 裂变：申请内测弹窗 ---
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [applyPhone, setApplyPhone] = useState('');
  const [applyInviteCode, setApplyInviteCode] = useState('');
  const [applyScenario, setApplyScenario] = useState('');
  const [applyFrequency, setApplyFrequency] = useState('');
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [inviteCodeChecking, setInviteCodeChecking] = useState(false);
  const [inviteCodeValid, setInviteCodeValid] = useState<null | boolean>(null);
  const [inviteCodeInviter, setInviteCodeInviter] = useState<InviterPreview | null>(null);
  const inviteCodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount, pre-fill invite code from sessionStorage (captured from URL in App.tsx)
  useEffect(() => {
    const pending = readPendingInviteCode();
    if (pending) setApplyInviteCode(pending);
  }, []);

  // Realtime invite-code validation (debounced)
  useEffect(() => {
    if (inviteCodeTimerRef.current) {
      clearTimeout(inviteCodeTimerRef.current);
      inviteCodeTimerRef.current = null;
    }
    const code = applyInviteCode.trim();
    if (!code) {
      setInviteCodeChecking(false);
      setInviteCodeValid(null);
      setInviteCodeInviter(null);
      return;
    }
    setInviteCodeChecking(true);
    inviteCodeTimerRef.current = setTimeout(async () => {
      try {
        const res = await authApi.validateInviteCode(code);
        setInviteCodeValid(res.valid);
        setInviteCodeInviter(res.inviter || null);
      } catch {
        setInviteCodeValid(false);
        setInviteCodeInviter(null);
      } finally {
        setInviteCodeChecking(false);
      }
    }, 400);
    return () => {
      if (inviteCodeTimerRef.current) {
        clearTimeout(inviteCodeTimerRef.current);
        inviteCodeTimerRef.current = null;
      }
    };
  }, [applyInviteCode]);

  const openApplyDialog = () => {
    setApplyError('');
    setApplySuccess(false);
    setApplyPhone(phone && phone.length === 11 ? phone : '');
    const pending = readPendingInviteCode();
    if (pending && !applyInviteCode) setApplyInviteCode(pending);
    setIsApplyOpen(true);
  };

  const closeApplyDialog = () => {
    if (applySubmitting) return;
    setIsApplyOpen(false);
  };

  const handleApplySubmit = async () => {
    setApplyError('');
    const phoneValue = applyPhone.trim();
    if (!phoneValue || phoneValue.length < 6) {
      setApplyError(t.invite_apply_error_missing_phone);
      return;
    }
    setApplySubmitting(true);
    try {
      await authApi.submitInviteApplication({
        phoneNumber: phoneValue,
        usageScenario: applyScenario.trim() || undefined,
        usageFrequency: applyFrequency.trim() || undefined,
        inviteCode: applyInviteCode.trim() || undefined,
      });
      setApplySuccess(true);
    } catch (err: any) {
      setApplyError(err?.message || t.invite_apply_error_generic);
    } finally {
      setApplySubmitting(false);
    }
  };

  // --- 自动跳转逻辑 ---
  // 场景：用户打开页面时 Session 依然有效 (自动登录)
  useEffect(() => {
    // 只有当不是正在手动提交、且没有播放成功动画时，才执行自动跳转
    if (!isLoading && user && !isSubmitting && !isLoginSuccess) {
      navigate(safeReturnUrl, { replace: true });
    }
  }, [isLoading, user, isSubmitting, isLoginSuccess, navigate, safeReturnUrl]);

  // --- 验证码倒计时逻辑 ---
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // --- 发送验证码处理 ---
  const handleSendCode = async () => {
    if (phone.length !== 11) {
      setError(t.login_error_invalid_phone);
      return;
    }
    setError('');
    setIsSendingCode(true);
    try {
      await authApi.sendCode(phone);
      setCountdown(60);
    } catch (err: any) {
      setError(err.message || "Failed to send code");
    } finally {
      setIsSendingCode(false);
    }
  };

  // --- 登录提交处理 ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoginSuccess) return;
    setError('');
    if (!hasAcceptedAgreement) {
      setShowAgreementError(true);
      return;
    }
    setShowAgreementError(false);

    try {
      // 1. 标记正在提交 (这会防止下方的自动跳转拦截逻辑生效)
      setIsSubmitting(true);

      // 优先使用主表单上用户手动填的邀请码；若为空则回退到 sessionStorage 里 URL 捕获的那份
      const pendingInviteCode = inlineInviteCode.trim() || readPendingInviteCode();

      let data: any;
      let loginIdentifier = '';
      if (authMode === 'phone') {
        if (!phone || !otp) throw new Error(t.login_error_missing_fields);
        if (phone.length !== 11) throw new Error(t.login_error_invalid_phone);
        data = await authApi.loginWithPhone(phone, otp, pendingInviteCode || undefined);
        loginIdentifier = phone;
      } else {
        if (!identifier || !password) throw new Error(t.login_error_missing_account_password);
        if (isRegister) {
          if (password !== confirmPassword) throw new Error(t.login_error_password_mismatch);
          if (!isStrongPassword(password)) throw new Error(t.password_rule_hint);
          data = await authApi.registerWithPassword({
            identifier,
            password,
            confirmPassword,
            inviteCode: pendingInviteCode || undefined,
          });
        } else {
          data = await authApi.loginWithPassword(identifier, password);
        }
        loginIdentifier = identifier;
      }

      // Clear the pending invite code after it's been consumed by a successful auth call.
      try { sessionStorage.removeItem(PENDING_INVITE_CODE_KEY); } catch {}
      
      // 2. 更新 Context 状态 (此时 user 变为非空)
      await login(loginIdentifier, data);

      // 3. 触发成功动画状态
      setIsLoginSuccess(true);
      
      // 4. 等待动画播放完毕后跳转
      setTimeout(() => {
        navigate(safeReturnUrl);
      }, 1200);

    } catch (err: any) {
      setError(err.message || "Login failed");
      setIsSubmitting(false); // 失败时重置提交状态
    }
  };

  // --- 拦截渲染逻辑 ---

  // 1. Session 校验中：显示居中 Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  // 2. 已登录且非手动操作：显示空背景等待 useEffect 跳转 (防止表单闪烁)
  // [关键修改] 增加了 !isSubmitting 条件
  // 如果正在提交(isSubmitting=true)，说明是手动登录，需要继续渲染下方的 JSX 以显示动画，不能 return null
  if (user && !isSubmitting && !isLoginSuccess) {
    return <div className="min-h-screen bg-[#050505]" />;
  }

  return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
        className="min-h-screen w-full flex bg-[#050505] text-white overflow-hidden font-sans relative"
      >

        {/* --- 全屏登录成功动画层 --- */}
        <AnimatePresence>
          {isLoginSuccess && (
              <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none"
              >
                <div className="absolute inset-0 bg-white/5 animate-pulse duration-700" />
                <div className="w-20 h-20 rounded-full bg-violet-500/50 shadow-[0_0_100px_50px_rgba(139,92,246,0.6)] animate-ping-slow" />
                <div className="absolute w-40 h-40 rounded-full border-2 border-orange-500/30 animate-ripple" />
                <div className="relative z-[101]">
                  <CheckCircle2 className="w-24 h-24 text-white drop-shadow-[0_0_20px_rgba(139,92,246,0.8)]" />
                </div>
              </motion.div>
          )}
        </AnimatePresence>

        {/* --- 左侧面板：品牌展示 --- */}
        <div className={`hidden lg:flex w-1/2 relative flex-col items-center justify-center overflow-hidden transition-all duration-1000 ${isLoginSuccess ? 'scale-110 blur-xl opacity-50' : ''}`}>
          <div className="absolute inset-0 bg-gradient-to-b from-[#1e0a45] via-[#311463] to-[#7c2d12] opacity-100" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-20" />

          <div className="relative z-20 flex flex-col items-center text-center px-12">
            {/* 呼吸图标 */}
            <div className="w-32 h-32 mb-8 rounded-[2.5rem] bg-white/10 backdrop-blur-2xl border border-white/20 flex items-center justify-center shadow-[0_0_50px_rgba(139,92,246,0.3)]">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-400 to-violet-500 animate-pulse" />
            </div>

            {/* 动态流光标题 - 修复显示不全问题 */}
            <div className="relative group mb-8 overflow-visible">
              <motion.h1
                  animate={{
                    backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                    y: [0, -5, 0]
                  }}
                  transition={{
                    backgroundPosition: { duration: 5, repeat: Infinity, ease: "linear" },
                    y: { duration: 4, repeat: Infinity, ease: "easeInOut" }
                  }}
                  style={{ backgroundSize: "200% auto" }}
                  className="text-7xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-400 via-orange-400 to-white leading-[1.1] drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)] px-10 py-4 whitespace-nowrap"
              >
                VFLOW AI
              </motion.h1>
              <motion.div
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="absolute -inset-x-10 -bottom-2 h-px bg-gradient-to-r from-transparent via-violet-500 to-transparent blur-sm"
              />
            </div>

            {/* 副标题：支持英文双行排版 */}
            <p
                className="text-sm font-bold tracking-[0.4em] text-white/80 uppercase leading-relaxed max-w-[320px] text-center"
                dangerouslySetInnerHTML={{ __html: t.login_tagline }}
            />
          </div>
        </div>

        {/* --- 右侧面板：表单操作 --- */}
        <div className={`w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-16 relative bg-[#000000] transition-transform duration-1000 ${isLoginSuccess ? 'scale-90 opacity-0' : ''}`}>
          <div className="absolute top-8 right-8 flex items-center gap-6 z-50">
            <LanguageSwitcher />
            <button onClick={() => navigate('/')} className="text-gray-500 hover:text-white transition-all hover:rotate-90">
              <X size={24} />
            </button>
          </div>

          <div className="w-full max-w-md mt-10 lg:mt-0">
            <h2 className="text-4xl font-bold mb-10 text-white tracking-tight">{t.login_title}</h2>

            <AnimatePresence mode="wait">
              {error && (
                  <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm font-bold"
                  >
                    <AlertCircle size={18} />
                    {error}
                  </motion.div>
              )}
            </AnimatePresence>

            <div className="mb-8 grid grid-cols-2 gap-2 p-1 rounded-xl border border-white/10 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('phone');
                  setIsRegister(false);
                  setError('');
                }}
                className={`py-2 text-sm font-bold rounded-lg transition ${authMode === 'phone' ? 'bg-violet-500/25 text-white border border-violet-500/40' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {t.login_tab_phone}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('password');
                  setError('');
                }}
                className={`py-2 text-sm font-bold rounded-lg transition ${authMode === 'password' ? 'bg-violet-500/25 text-white border border-violet-500/40' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {t.login_tab_password}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {authMode === 'phone' ? (
                <div className="space-y-6">
                  <div className="bg-[#0a0a0a] rounded-xl border border-white/10 flex items-center p-1 focus-within:border-violet-500/60 transition-all duration-300">
                    <div className="px-5 py-3 text-gray-400 border-r border-white/10 text-sm font-bold">+86</div>
                    <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder={t.login_input_phone}
                        className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none"
                    />
                  </div>
                  <div className="bg-[#0a0a0a] rounded-xl border border-white/10 flex items-center p-1 focus-within:border-violet-500/60 transition-all duration-300">
                    <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder={t.login_input_code}
                        className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none tracking-[0.2em]"
                        maxLength={6}
                    />
                    <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={isSendingCode || countdown > 0 || phone.length !== 11}
                        className="mr-1 px-5 py-2 rounded-lg text-xs font-bold transition-all bg-white/5 text-gray-300 disabled:opacity-20 border border-white/5"
                    >
                      {isSendingCode ? <Loader2 className="animate-spin" size={14} /> : countdown > 0 ? `${countdown}s` : t.login_btn_get_code}
                    </button>
                  </div>
                  <InviteCodeField
                    value={inlineInviteCode}
                    onChange={setInlineInviteCode}
                    disabled={isSubmitting}
                    entryLabel={t.invite_code_field_entry_new_user}
                    hint={t.invite_code_field_new_user_hint}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-[#0a0a0a] rounded-xl border border-white/10 flex items-center p-1 focus-within:border-violet-500/60 transition-all duration-300">
                    <input
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder={t.login_input_identifier}
                        className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none"
                    />
                  </div>
                  <div className="bg-[#0a0a0a] rounded-xl border border-white/10 flex items-center p-1 focus-within:border-violet-500/60 transition-all duration-300">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t.login_input_password}
                        className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none"
                    />
                  </div>
                  {isRegister && (
                    <>
                      <p className="px-1 text-xs text-zinc-500">
                        {t.password_rule_hint}
                      </p>
                      <div className="bg-[#0a0a0a] rounded-xl border border-white/10 flex items-center p-1 focus-within:border-violet-500/60 transition-all duration-300">
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder={t.login_input_confirm_password}
                            className="flex-1 bg-transparent text-white text-sm px-4 py-3 outline-none"
                        />
                      </div>
                      <InviteCodeField
                        value={inlineInviteCode}
                        onChange={setInlineInviteCode}
                        disabled={isSubmitting}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegister(!isRegister);
                      setError('');
                    }}
                    className="text-xs text-violet-300 hover:text-violet-200 transition font-bold"
                  >
                    {isRegister ? t.login_switch_to_login : t.login_switch_to_register}
                  </button>
                </div>
              )}

              <div className="pt-4">
                <label className="group flex items-start gap-3 text-xs font-medium text-zinc-400 leading-5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasAcceptedAgreement}
                    onChange={(e) => {
                      setHasAcceptedAgreement(e.target.checked);
                      if (e.target.checked) setShowAgreementError(false);
                    }}
                    className="peer sr-only"
                  />
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-white/20 bg-white/[0.03] text-transparent transition-all duration-200 group-hover:border-violet-400/70 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500/50 peer-checked:border-violet-400 peer-checked:bg-violet-500 peer-checked:text-white peer-checked:shadow-[0_0_14px_rgba(139,92,246,0.45)]">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                  <span>
                    {t.login_agreement_checkbox_prefix}
                    <a href="/terms-of-service" target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200 transition">
                      <span aria-hidden="true">《</span>{t.login_agreement_user}<span aria-hidden="true">》</span>
                    </a>
                    {t.login_agreement_checkbox_connector}
                    <a href="/privacy-policy" target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200 transition">
                      <span aria-hidden="true">《</span>{t.login_agreement_privacy}<span aria-hidden="true">》</span>
                    </a>
                  </span>
                </label>
                {showAgreementError && (
                  <div className="mt-1.5 pl-6 text-xs font-bold text-red-500">
                    {t.login_agreement_required}
                  </div>
                )}
              </div>

              <button
                  type="submit"
                  disabled={isSubmitting || isLoginSuccess}
                  className="w-full bg-[#111] hover:bg-violet-600/10 text-white font-black py-4 rounded-xl transition-all duration-500 border border-white/10 hover:border-violet-500 flex items-center justify-center mt-10 text-sm tracking-widest hover:shadow-[0_0_30px_rgba(139,92,246,0.2)]"
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : authMode === 'phone' ? (
                  t.login_btn_start
                ) : isRegister ? (
                  t.login_btn_register_and_login
                ) : (
                  t.login_btn_password_login
                )}
              </button>
            </form>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={openApplyDialog}
                className="text-xs font-bold text-zinc-400 hover:text-violet-300 transition tracking-wide underline-offset-4 hover:underline"
              >
                {t.login_apply_beta_entry}
              </button>
            </div>
          </div>
        </div>

        <AppDialog
          isOpen={isApplyOpen}
          title={applySuccess ? t.invite_apply_success_title : t.invite_apply_title}
          subtitle={applySuccess ? undefined : t.invite_apply_desc}
          onClose={closeApplyDialog}
          overlayClassName="z-[130]"
          footer={applySuccess ? (
            <button
              type="button"
              onClick={closeApplyDialog}
              className="px-4 py-2 rounded-lg bg-violet-500/80 hover:bg-violet-500 text-white text-xs font-bold transition"
            >
              {t.invite_reward_close}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={closeApplyDialog}
                disabled={applySubmitting}
                className="px-4 py-2 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 text-xs font-bold transition disabled:opacity-40"
              >
                {t.invite_apply_cancel}
              </button>
              <button
                type="button"
                onClick={handleApplySubmit}
                disabled={applySubmitting}
                className="px-4 py-2 rounded-lg bg-violet-500/80 hover:bg-violet-500 text-white text-xs font-bold transition flex items-center gap-2 disabled:opacity-40"
              >
                {applySubmitting && <Loader2 className="animate-spin" size={14} />}
                {applySubmitting ? t.invite_apply_submitting : t.invite_apply_submit}
              </button>
            </>
          )}
        >
          {applySuccess ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <div className="text-sm font-semibold text-zinc-100">{t.invite_apply_success_title}</div>
              <div className="text-xs text-zinc-400 max-w-xs leading-relaxed">{t.invite_apply_success_desc}</div>
            </div>
          ) : (
            <div className="space-y-4">
              {applyError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle size={14} /> {applyError}
                </div>
              )}
              <label className="block">
                <div className="text-xs font-bold text-zinc-300 mb-1.5">{t.invite_apply_phone_label}</div>
                <input
                  type="text"
                  value={applyPhone}
                  onChange={(e) => setApplyPhone(e.target.value)}
                  placeholder={t.invite_apply_phone_placeholder}
                  disabled={applySubmitting}
                  className="w-full bg-[#0a0a0a] rounded-lg border border-white/10 text-white text-sm px-3 py-2.5 outline-none focus:border-violet-500/60 transition disabled:opacity-50"
                />
              </label>
              <label className="block">
                <div className="text-xs font-bold text-zinc-300 mb-1.5">{t.invite_apply_invite_code_label}</div>
                <input
                  type="text"
                  value={applyInviteCode}
                  onChange={(e) => setApplyInviteCode(e.target.value.toUpperCase())}
                  placeholder={t.invite_apply_invite_code_placeholder}
                  disabled={applySubmitting}
                  maxLength={16}
                  className="w-full bg-[#0a0a0a] rounded-lg border border-white/10 text-white text-sm px-3 py-2.5 outline-none focus:border-violet-500/60 transition disabled:opacity-50 tracking-widest"
                />
                {applyInviteCode.trim().length > 0 && (
                  <div className="mt-1.5 text-[11px] font-semibold">
                    {inviteCodeChecking && (
                      <span className="text-zinc-400">{t.invite_code_checking}</span>
                    )}
                    {!inviteCodeChecking && inviteCodeValid === true && (
                      <span className="text-emerald-400">
                        {t.invite_code_valid_hint.replace('{name}', inviteCodeInviter?.nickname || inviteCodeInviter?.invite_code || '')}
                      </span>
                    )}
                    {!inviteCodeChecking && inviteCodeValid === false && (
                      <span className="text-amber-400">{t.invite_code_invalid_hint}</span>
                    )}
                  </div>
                )}
              </label>
              <label className="block">
                <div className="text-xs font-bold text-zinc-300 mb-1.5">{t.invite_apply_scenario_label}</div>
                <textarea
                  value={applyScenario}
                  onChange={(e) => setApplyScenario(e.target.value)}
                  placeholder={t.invite_apply_scenario_placeholder}
                  disabled={applySubmitting}
                  rows={2}
                  className="w-full bg-[#0a0a0a] rounded-lg border border-white/10 text-white text-sm px-3 py-2.5 outline-none focus:border-violet-500/60 transition disabled:opacity-50 resize-none"
                />
              </label>
              <label className="block">
                <div className="text-xs font-bold text-zinc-300 mb-1.5">{t.invite_apply_frequency_label}</div>
                <input
                  type="text"
                  value={applyFrequency}
                  onChange={(e) => setApplyFrequency(e.target.value)}
                  placeholder={t.invite_apply_frequency_placeholder}
                  disabled={applySubmitting}
                  className="w-full bg-[#0a0a0a] rounded-lg border border-white/10 text-white text-sm px-3 py-2.5 outline-none focus:border-violet-500/60 transition disabled:opacity-50"
                />
              </label>
            </div>
          )}
        </AppDialog>

        <footer className="absolute right-8 bottom-4 z-[120] text-right">
          <a
            href="http://beian.miit.gov.cn"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            粤ICP备2026027661号
          </a>
        </footer>
      </motion.div>
  );
};

export default LoginPage;
