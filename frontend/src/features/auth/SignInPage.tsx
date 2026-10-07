import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Field, Input, Spinner } from '@fluentui/react-components';
import type { Credentials, SetupStatus } from '../../api/contracts';
import './auth.css';

export function SignInPage({ setup }: { setup: SetupStatus }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const credentials: Credentials = {
      login: String(data.get('login') || ''), password: String(data.get('password') || ''),
      demo: data.has('demo'),
      ...(setup.required ? { name: String(data.get('name') || ''), setupToken: String(data.get('setupToken') || '') } : {}),
    };
    setBusy(true); setError('');
    try { await window.MiniDevOpsRuntime.signIn(credentials, setup.required); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '登录失败，请重试。'); }
    finally { setBusy(false); }
  }
  return <div className="auth-page fluent-auth">
    <div className="auth-story">
      <img src="/icon.svg" width="48" height="48" alt="" />
      <div className="wordmark">Mini DevOps</div>
      <h1>把想法，<br />一步步变成成果。</h1>
      <p>规划工作，保持专注。<br />让团队在同一个看板上协作。</p>
      <small>BOARDS · BACKLOGS · SPRINTS</small>
    </div>
    <div className="auth-form-wrap">
      <form id="auth-form" data-setup={setup.required} onSubmit={submit} aria-busy={busy}>
        <div className="overline">你的团队工作空间</div>
        <h2>{setup.required ? '开始使用 Mini DevOps' : '欢迎回来'}</h2>
        <p className="muted">{setup.required ? '创建管理员账号，开启第一个项目。' : '登录以继续处理你的工作。'}</p>
        <div className="form-error" role="alert">{error}</div>
        {setup.required && <Field label="姓名" required><Input name="name" required maxLength={100} autoComplete="name" /></Field>}
        <Field label="账号" required><Input name="login" required minLength={3} maxLength={100} autoComplete="username" /></Field>
        <Field label="密码" required><Input name="password" type="password" required minLength={setup.required ? 12 : undefined} maxLength={128} autoComplete={setup.required ? 'new-password' : 'current-password'} /></Field>
        {setup.required && <>
          <p className="hint">密码至少 12 个字符。</p>
          <Field label="远程设置令牌（本机可留空）"><Input name="setupToken" autoComplete="off" /></Field>
          <Checkbox name="demo" defaultChecked label="添加示例工作项" />
        </>}
        <Button appearance="primary" type="submit" disabled={busy} className="auth-submit">
          {busy ? <Spinner size="tiny" /> : null}{setup.required ? '创建工作空间' : '登录'}
        </Button>
        <p className="hint">{setup.required ? '数据保存在你自己的部署环境中。' : '需要账号？请联系工作空间管理员。'}</p>
      </form>
    </div>
  </div>;
}
