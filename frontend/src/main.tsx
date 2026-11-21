import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarView, HabitList, Hero, StatsView, WeekChart, WeekStrip } from './Dashboard';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { api, ApiError, dateKey, formatDate, WEEKDAYS } from './data';
import type { Category, Dashboard, Habit, HabitInput, Profile } from './data';
import './styles.css';

type View = 'overview' | 'calendar' | 'stats' | 'profile';
type ModalState = { kind: 'habit'; habit?: Habit } | { kind: 'auth'; mode: 'login' | 'register' };
const navigation: { key: View; label: string; icon: IconName }[] = [
  { key: 'overview', label: 'Обзор', icon: 'grid' },
  { key: 'calendar', label: 'Календарь', icon: 'calendar' },
  { key: 'stats', label: 'Статистика', icon: 'chart' },
  { key: 'profile', label: 'Профиль', icon: 'user' },
];

function Brand() {
  return <div className="brand"><span className="brand-mark"><Icon name="logo" size={25} /></span>
    <div><strong>Путь<span>.</span></strong><small>ТРЕКЕР ПРИВЫЧЕК</small></div></div>;
}

function Modal({ title, close, busy, children }: { title: string; close: () => void; busy: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} aria-labelledby="dialog-title" onCancel={event => {
    event.preventDefault();
    if (!busy) close();
  }} onClick={event => { if (event.target === event.currentTarget && !busy) close(); }}>
    <div className="dialog-inner">
      <div className="panel-heading"><h2 id="dialog-title">{title}</h2>
        <button type="button" className="icon-button outline" onClick={close} disabled={busy} aria-label="Закрыть"><Icon name="close" size={18} /></button></div>
      {children}
    </div>
  </dialog>;
}

function HabitForm({ habit, categories, busy, addCategory, save, remove }: {
  habit?: Habit; categories: Category[]; busy: boolean; save: (input: HabitInput) => void; remove: () => void;
  addCategory: (name: string, select: (category: Category) => void) => void;
}) {
  const [days, setDays] = useState(habit?.weekdays ?? [0, 1, 2, 3, 4, 5, 6]);
  const [confirm, setConfirm] = useState(false);
  const [category, setCategory] = useState(habit?.category ?? 'mind');
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');

  function createCategory() {
    if (busy || !categoryName.trim()) return;
    addCategory(categoryName, created => {
      setCategory(created.id);
      setCategoryName('');
      setShowCategoryForm(false);
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    save({ name: String(fields.get('name')).trim(), category, weekdays: days });
  }
  return <form className="form" onSubmit={submit}>
    <label>Название<input name="name" defaultValue={habit?.name} placeholder="Например, читать 15 минут" maxLength={80} required /></label>
    <div className="category-picker">
      <label>Категория<select name="category" value={category} onChange={event => setCategory(event.target.value)}>
        {categories.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select></label>
      {showCategoryForm ? <div className="category-create">
        <label>Название новой категории<input autoFocus maxLength={32} value={categoryName}
          placeholder="Например, Творчество" onChange={event => setCategoryName(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); createCategory(); } }} /></label>
        <div className="category-actions">
          <button type="button" className="button soft" disabled={busy} onClick={() => setShowCategoryForm(false)}>Отмена</button>
          <button type="button" className="button primary" disabled={busy || !categoryName.trim()} onClick={createCategory}>Добавить</button>
        </div>
      </div> : <button type="button" className="text-button new-category" disabled={busy}
        onClick={() => setShowCategoryForm(true)}><Icon name="plus" size={15} /> Своя категория</button>}
    </div>
    <fieldset><legend>Дни недели</legend>
      <div className="weekday-options">{WEEKDAYS.map((day, index) => <button type="button" key={day}
        aria-pressed={days.includes(index)} onClick={() => setDays(current =>
          current.includes(index) ? current.filter(value => value !== index) : [...current, index])}>{day}</button>)}</div>
    </fieldset>
    {confirm && <p className="form-note">Привычка и все её отметки будут удалены.</p>}
    <div className="form-actions">
      {habit && <button className="button danger" type="button" disabled={busy}
        onClick={() => confirm ? remove() : setConfirm(true)}><Icon name="trash" size={17} />{confirm ? 'Удалить навсегда' : 'Удалить'}</button>}
      <button className="button primary" disabled={busy || !days.length} type="submit"><Icon name="check" size={17} />Сохранить</button>
    </div>
  </form>;
}

function AuthForm({ mode, busy, change, submit }: {
  mode: 'login' | 'register'; busy: boolean; change: () => void; submit: (input: object) => void;
}) {
  return <form className="form" onSubmit={event => {
    event.preventDefault();
    submit(Object.fromEntries(new FormData(event.currentTarget)));
  }}>
    {mode === 'register' && <label>Имя<input name="name" autoComplete="name" required maxLength={50} /></label>}
    <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
    <label>Пароль<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} maxLength={128} /></label>
    {mode === 'register' && <p className="form-note">Минимум 8 символов. В новом аккаунте будет свой список привычек.</p>}
    <button className="button primary" type="submit" disabled={busy}>{mode === 'login' ? 'Войти' : 'Создать аккаунт'}<Icon name="arrow" size={17} /></button>
    <button className="text-button" type="button" onClick={change} disabled={busy}>{mode === 'login' ? 'Создать аккаунт' : 'Уже есть аккаунт? Войти'}</button>
  </form>;
}

function App() {
  const today = dateKey();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<View>('overview');
  const [selected, setSelected] = useState(today);
  const [data, setData] = useState<Dashboard | null>(null);
  const [revision, setRevision] = useState(0);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<ModalState | null>(null);

  function switchAccount(user: Profile | null) {
    setData(null);
    setProfile(user);
    setSelected(dateKey());
    setView('overview');
    setModal(null);
  }

  useEffect(() => {
    let active = true;
    api<Profile>('/me').catch(error => {
      if (error instanceof ApiError && error.status === 401) {
        return api<Profile>(`/auth/demo?today=${dateKey()}`, 'POST');
      }
      throw error;
    }).then(user => { if (active) setProfile(user); })
      .catch(() => { if (active) setError('Не удалось связаться с сервером. Попробуй открыть демо снова.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const userId = profile?.id;
  useEffect(() => {
    if (userId === undefined) return;
    let active = true;
    setDashboardLoading(true);
    api<Dashboard>(`/dashboard?today=${today}&selected=${selected}`)
      .then(result => { if (active) setData(result); })
      .catch(error => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) switchAccount(null);
        setError(error instanceof ApiError ? error.message : 'Не удалось загрузить привычки.');
      })
      .finally(() => { if (active) setDashboardLoading(false); });
    return () => { active = false; };
  }, [userId, today, selected, revision]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function run(action: () => Promise<void>) {
    setWorking(true);
    setError('');
    try { await action(); }
    catch (error) { setError(error instanceof ApiError ? error.message : 'Не удалось связаться с сервером.'); }
    finally { setWorking(false); }
  }

  function refresh(message: string) {
    setDashboardLoading(true);
    setRevision(value => value + 1);
    setNotice(message);
  }

  function selectDate(date: string) {
    setError('');
    setSelected(date);
  }

  function openModal(state: ModalState) {
    setError('');
    setModal(state);
  }

  const add = () => openModal({ kind: 'habit' });
  const openDemo = () => run(async () => switchAccount(await api<Profile>(`/auth/demo?today=${today}`, 'POST')));
  const habitList = data && <HabitList data={data}
    busy={working || dashboardLoading || selected !== data.selected} add={add}
    edit={habit => openModal({ kind: 'habit', habit })}
    toggle={habit => run(async () => {
      await api(`/habits/${habit.id}/completions/${data.selected}?today=${today}`, 'PUT', { completed: !habit.completed });
      refresh(habit.completed ? 'Отметка снята' : 'Выполнение отмечено');
    })} />;

  return <>
    {profile ? <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Основная навигация">{navigation.map(item => <button type="button" key={item.key}
          className={view === item.key ? 'nav-item active' : 'nav-item'} aria-current={view === item.key ? 'page' : undefined}
          onClick={() => { setView(item.key); if (item.key === 'overview') selectDate(today); }}>
          <Icon name={item.icon} size={19} /><span>{item.label}</span>
        </button>)}</nav>
        <div className="sidebar-bottom">
          {profile.demo && <div className="demo-card"><Icon name="spark" size={19} /><div><strong>Демо-режим</strong>
            <button type="button" onClick={() => openModal({ kind: 'auth', mode: 'register' })}>Создать аккаунт <Icon name="arrow" size={13} /></button></div></div>}
          <button className="account" type="button" aria-label="Открыть профиль" onClick={() => setView('profile')}>
            <span className="avatar">{Array.from(profile.name)[0]?.toUpperCase()}</span>
            <span><strong>{profile.name}</strong><small>{profile.demo ? 'Гостевой аккаунт' : 'Личный кабинет'}</small></span>
            <Icon name="right" size={16} />
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="page-header">
          <div><p className="header-date"><Icon name="calendar" size={15} />
            {formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{view === 'overview' ? (profile.demo && profile.name === 'Гость' ? 'Твой день' : `Привет, ${profile.name}`) :
            navigation.find(item => item.key === view)?.label}</h1></div>
          {view !== 'profile' && <button className="button primary add-habit" type="button" disabled={!data} onClick={add}><Icon name="plus" size={18} /> Новая привычка</button>}
        </header>
        {error && !modal && <p className="feedback error" role="alert">{error} {view !== 'profile' && <button className="text-button" onClick={() => {
          setError(''); setRevision(value => value + 1);
        }}>Повторить</button>}</p>}
        {view === 'profile' ? <section className="panel profile-panel">
          <div className="panel-heading"><div><h2>Личные данные</h2><p>{profile.demo ? 'Гостевой режим' : profile.email}</p></div>
            <span className="panel-icon"><Icon name="user" /></span></div>
          <form className="form" key={profile.id} onSubmit={event => {
            event.preventDefault();
            const name = new FormData(event.currentTarget).get('name');
            void run(async () => { setProfile(await api<Profile>('/me', 'PATCH', { name })); setNotice('Профиль сохранён'); });
          }}><label>Имя<input name="name" defaultValue={profile.name} required maxLength={50} /></label>
            <button className="button primary" type="submit" disabled={working}>Сохранить имя</button></form>
          <div className="profile-actions">
            {profile.demo && <button className="button primary" type="button" onClick={() => openModal({ kind: 'auth', mode: 'register' })}>Создать аккаунт</button>}
            {profile.demo && <button className="button soft" type="button" onClick={() => openModal({ kind: 'auth', mode: 'login' })}>Войти в аккаунт</button>}
            <button className="button outline-button" type="button" disabled={working} onClick={() =>
              run(async () => { await api('/auth/logout', 'POST'); switchAccount(null); })}><Icon name="logout" size={17} />Выйти</button>
          </div>
        </section> : data ? <div className="content" aria-busy={dashboardLoading}>
          {view === 'overview' && <><Hero data={data} /><WeekStrip data={data} select={selectDate}
            busy={dashboardLoading || selected !== data.selected} />
            <div className="overview-grid">{habitList}<WeekChart data={data} showSelectedWeek /></div></>}
          {view === 'calendar' && <div className="calendar-layout"><CalendarView data={data} select={selectDate} />{habitList}</div>}
          {view === 'stats' && <StatsView data={data} select={selectDate} />}
        </div> : !error && <p className="feedback" role="status">Загружаем привычки…</p>}
      </main>
    </div> : <main className="welcome">
      <Brand /><div className="welcome-copy"><h1>Шаг за шагом.<br/><em>В своём темпе.</em></h1>
      <p>Планируй привычки, отмечай выполненное и наблюдай за своим прогрессом.</p>
      {error && !modal && <p className="feedback error" role="alert">{error}</p>}
      {loading ? <p role="status">Открываем трекер…</p> : <div className="welcome-actions">
        <button className="button primary" disabled={working} type="button" onClick={openDemo}><Icon name="spark" size={18} />Открыть демо</button>
        <button className="button outline-button" type="button" onClick={() => openModal({ kind: 'auth', mode: 'login' })}>Войти</button>
      </div>}</div>
    </main>}
    {notice && <div className="toast" role="status"><Icon name="check" size={17} />{notice}</div>}
    {modal && <Modal busy={working} close={() => { setModal(null); setError(''); }}
      title={modal.kind === 'habit' ? (modal.habit ? 'Редактировать привычку' : 'Новая привычка') :
        (modal.mode === 'login' ? 'Войти в аккаунт' : 'Создать аккаунт')}>
      {error && <p className="feedback error" role="alert">{error}</p>}
      {modal.kind === 'habit' ? <HabitForm habit={modal.habit} categories={data?.categories ?? []} busy={working}
        addCategory={(name, select) => run(async () => {
          const category = await api<Category>('/categories', 'POST', { name });
          setData(current => current && { ...current, categories: [...current.categories, category] });
          select(category);
          refresh('Категория добавлена');
        })}
        save={input => run(async () => {
          await (modal.habit ? api(`/habits/${modal.habit.id}`, 'PUT', input) : api(`/habits?today=${today}`, 'POST', input));
          setModal(null);
          refresh(modal.habit ? 'Изменения сохранены' : 'Привычка добавлена');
        })}
        remove={() => run(async () => {
          if (!modal.habit) return;
          await api(`/habits/${modal.habit.id}`, 'DELETE');
          setModal(null);
          refresh('Привычка удалена');
        })} /> : <AuthForm key={modal.mode} mode={modal.mode} busy={working}
        change={() => openModal({ kind: 'auth', mode: modal.mode === 'login' ? 'register' : 'login' })}
        submit={input => run(async () => {
          switchAccount(await api<Profile>(`/auth/${modal.mode}`, 'POST', input));
          setNotice(modal.mode === 'login' ? 'Вход выполнен' : 'Аккаунт создан');
        })} />}
    </Modal>}
  </>;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
