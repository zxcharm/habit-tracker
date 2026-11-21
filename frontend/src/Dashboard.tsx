import { useState } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { formatDate, parseDate, shiftDay, shiftMonth, WEEKDAYS } from './data';
import type { Activity, Dashboard, Habit } from './data';

const categoryIcons = new Map<string, IconName>([
  ['mind', 'book'], ['body', 'leaf'], ['focus', 'bolt'], ['rest', 'moon'],
] as const);

function weekDates(day: string): string[] {
  const mondayOffset = (parseDate(day).getDay() + 6) % 7;
  return WEEKDAYS.map((_, index) => shiftDay(day, index - mondayOffset));
}

function weekLabel(days: string[]): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
    .formatRange(parseDate(days[0]), parseDate(days[6]));
}

function percent(day?: Activity): number {
  return day?.scheduled ? Math.round(day.completed / day.scheduled * 100) : 0;
}

export function Hero({ data }: { data: Dashboard }) {
  const scheduled = data.habits.filter(habit => habit.scheduled);
  const completed = scheduled.filter(habit => habit.completed).length;
  const progress = scheduled.length ? Math.round(completed / scheduled.length * 100) : 0;
  const canBackfill = data.habits.some(habit => habit.can_mark && !habit.scheduled);
  return <section className="hero" aria-label="Прогресс дня">
    <div className="hero-copy">
      <span className="hero-kicker"><Icon name="spark" size={15} /> Прогресс дня</span>
      <h2>Шаг за шагом.<br/><em>В своём темпе.</em></h2>
      <p>{scheduled.length ? <>Выполнено <strong>{completed} из {scheduled.length}</strong> привычек на этот день.</>
        : canBackfill ? 'На эту дату можно добавить отметку задним числом.' : 'На этот день привычек в расписании пока нет.'}</p>
    </div>
    <div className="hero-art" aria-label={`Выполнено ${progress}%`}>
      <div className="orbit orbit-outer" /><div className="orbit orbit-inner" />
      <span className="art-star"><Icon name="spark" size={20} /></span>
      <span className="art-star secondary"><Icon name="spark" size={10} /></span>
      <div className="meter">
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r="71" className="meter-track" />
          <circle cx="80" cy="80" r="71" className="meter-progress" pathLength="100"
            strokeDasharray={`${progress} 100`} opacity={progress > 0 ? 1 : 0} />
        </svg>
        <div><strong>{progress}<small>%</small></strong><span>выполнено</span></div>
      </div>
    </div>
  </section>;
}

export function WeekStrip({ data, select, busy }: { data: Dashboard; select: (date: string) => void; busy: boolean }) {
  const activeDates = weekDates(data.selected);
  const isCurrent = activeDates.includes(data.today);
  const next = shiftDay(data.selected, 7);
  return <section className="week-picker" aria-label="Выбор недели">
    <div className="week-toolbar">
      <h2>{weekLabel(activeDates)}</h2>
      <div className="calendar-actions">
        <button className="icon-button outline" type="button" aria-label="Предыдущая неделя" disabled={busy}
          onClick={() => select(shiftDay(data.selected, -7))}><Icon name="left" size={17} /></button>
        <button className="button soft" type="button" disabled={busy || data.selected === data.today}
          onClick={() => select(data.today)}>Сегодня</button>
        <button className="icon-button outline" type="button" aria-label="Следующая неделя" disabled={busy || isCurrent}
          onClick={() => select(next > data.today ? data.today : next)}><Icon name="right" size={17} /></button>
      </div>
    </div>
    <div className="week-strip" aria-label="Дни выбранной недели">
      {activeDates.map((date, index) => <button type="button" key={date}
        className={date === data.selected ? 'day selected' : 'day'}
        aria-pressed={date === data.selected} aria-label={formatDate(date, { day: 'numeric', month: 'long', weekday: 'long' })}
        onClick={() => select(date)}>
        <span>{WEEKDAYS[index]}</span><strong>{parseDate(date).getDate()}</strong>
        <i className={data.activity.some(day => day.date === date && day.completed) ? 'filled' : ''} />
      </button>)}
    </div>
  </section>;
}

export function HabitList({ data, busy, edit, toggle, add }: {
  data: Dashboard; busy: boolean; edit: (habit: Habit) => void;
  toggle: (habit: Habit) => void; add: () => void;
}) {
  return <section className="panel habits-panel">
    <div className="panel-heading">
      <div><h2>Мои привычки</h2><p>{data.selected === data.today ? 'План на сегодня' :
        formatDate(data.selected, { day: 'numeric', month: 'long', weekday: 'long' })}</p></div>
      <button className="icon-button outline" type="button" onClick={add} aria-label="Добавить привычку"><Icon name="plus" size={18} /></button>
    </div>
    {data.habits.length === 0 ? <div className="empty">
      <div className="empty-icon"><Icon name="target" size={26} /></div>
      <h3>Начни с одной привычки</h3><p>Выбери действие, которое хочешь повторять.</p>
      <button type="button" className="button soft" onClick={add}>Добавить привычку</button>
    </div> : <ul className="habit-list">
      {data.habits.map(habit => {
        const category = data.categories.find(category => category.id === habit.category);
        const icon = categoryIcons.get(habit.category);
        const disableMark = busy || !habit.can_mark;
        const scheduleNote = habit.scheduled ? '' : habit.can_mark ? ' · Можно отметить задним числом' : ' · Вне расписания';
        return <li className="habit-row" key={habit.id}>
          <span className={`category ${icon ? habit.category : 'custom'}`}><Icon name={icon ?? 'tag'} size={19} /></span>
          <div className="habit-text"><strong>{habit.name}</strong>
            <span>{category?.name ?? 'Категория'}{scheduleNote}</span></div>
          <span className="streak" title={`Текущая серия: ${habit.current_streak}; рекорд: ${habit.best_streak}`}>
            <Icon name="fire" size={16} /> {habit.current_streak}
          </span>
          <button type="button" className="icon-button edit" aria-label={`Изменить: ${habit.name}`} onClick={() => edit(habit)}><Icon name="edit" size={16} /></button>
          <button type="button" className={`check-button ${habit.completed ? 'checked' : ''}`}
            aria-pressed={habit.completed} aria-label={`${habit.completed ? 'Снять отметку' : 'Отметить'}: ${habit.name}`}
            disabled={disableMark} onClick={() => toggle(habit)}>
            {habit.completed && <Icon name="check" size={17} />}
          </button>
        </li>;
      })}
    </ul>}
  </section>;
}

type DailyMessages = readonly [string, string, string, string, string];

function dailyMessages(day: Activity, today: string): DailyMessages {
  if (day.date > today) return [
    'Этот день ещё впереди. Можно заранее выделить время на привычку.',
    'Когда наступит этот день, здесь появятся его отметки.',
    'Оставь в расписании немного времени для того, что хочется повторить.',
    'Заранее выбери, с какой привычки хочешь начать день.',
    'Подумай, после какого обычного дела будет удобно выполнить привычку.',
  ];
  if (!day.scheduled) return [
    'На этот день привычек в расписании нет.',
    'Ничего не было запланировано. Такой день тоже может быть частью твоего ритма.',
    'Если хочется добавить привычку, начни с действия, которое легко повторить.',
    'В плане на этот день было свободное место.',
    'Привычки можно распределить по тем дням, когда для них есть время.',
  ];
  if (!day.completed) return [
    'За этот день пока нет отметок. Возможно, что-то уже получилось сделать.',
    'Если день был плотным, попробуй в следующий раз выделить пять минут на одну привычку.',
    'Можно начать с того действия, на которое уходит меньше всего времени.',
    'Если привычка всё время выпадает, попробуй привязать её к обычному делу.',
    'При следующей попытке упрости первый шаг до действия, которое легко начать.',
  ];
  if (day.completed === day.scheduled) return [
    'Всё, что было в плане на день, выполнено.',
    'Все отметки на месте. Вспомни, что помогло найти время на привычки.',
    'План на день выполнен целиком. Можно сохранить такой объём задач.',
    'Каждая запланированная привычка получила своё время.',
    'День прошёл по плану. Какую из привычек было проще всего выполнить?',
  ];
  const progress = percent(day);
  if (progress < 40) return [
    'Часть плана выполнена. Вспомни, что помогло сделать первый шаг.',
    'Уже есть результат. Эту привычку можно взять за основу следующего дня.',
    'Если весь список тяжело уместить в день, оставь в приоритете одну привычку.',
    'Даже короткое действие засчитывается. Заметь, в какой момент оно поместилось в день.',
    'Попробуй повторить то, что уже получилось, в то же время дня.',
  ];
  if (progress < 70) return [
    'Выполнена примерно половина плана. Какие привычки удалось вписать легче всего?',
    'Часть плана уже выполнена. Сохраняй темп, который тебе подходит.',
    'То, что удалось выполнить, можно повторить в похожих условиях.',
    'Посмотри, какие отметки дались легко. Возможно, им помогло удачное время.',
    'Половина списка — хороший повод проверить, подходит ли тебе его объём.',
  ];
  return [
    'Большая часть плана на день выполнена. Заметь, что помогло.',
    'Почти весь список закрыт. Вспомни, какая привычка потребовала меньше всего усилий.',
    'Удалось выполнить большую часть. Такой темп можно сохранить, если он удобен.',
    'В плане осталось немного. Посмотри, был ли для этих привычек подходящий момент.',
    'Хороший результат за день. Можно повторить порядок, в котором тебе было удобно действовать.',
  ];
}

function DailyNote({ day, today }: { day: Activity; today: string }) {
  const [offset, setOffset] = useState(0);
  const messages = dailyMessages(day, today);
  const dayNumber = Date.parse(day.date + 'T00:00:00Z') / 86_400_000;
  const index = (dayNumber + offset) % messages.length;
  return <div className="progress-note">
    <span className="note-icon"><Icon name="spark" size={16} /></span>
    <div className="note-copy" aria-live="polite">
      <small>{formatDate(day.date, { day: 'numeric', month: 'long' })}
        {day.date <= today && day.scheduled > 0 && ` · ${percent(day)}% за день`}</small>
      <p>{messages[index]}</p>
    </div>
    <button type="button" className="icon-button" aria-label="Показать другую фразу" title="Другая фраза"
      onClick={() => setOffset(value => (value + 1) % messages.length)}><Icon name="refresh" size={16} /></button>
  </div>;
}

export function WeekChart({ data, expanded = false, showSelectedWeek = false }: {
  data: Dashboard; expanded?: boolean; showSelectedWeek?: boolean;
}) {
  const days = weekDates(showSelectedWeek ? data.selected : data.today);
  const totals = showSelectedWeek ? data.selected_week : data.week;
  const selectedDay = data.activity.find(day => day.date === data.selected);
  const isCurrent = days.includes(data.today);
  const title = isCurrent ? 'Эта неделя' : 'Выбранная неделя';
  return <section className={`panel chart-panel ${expanded ? 'expanded' : ''}`}>
    <div className="panel-heading"><div><h2>{title}</h2>
      <p>{isCurrent ? 'Доля выполненных по дням' : weekLabel(days)}</p></div><span className="panel-icon"><Icon name="chart" size={19} /></span></div>
    <div className="bars" role="list" aria-label={`Доля выполненных по дням: ${weekLabel(days)}`}>
      {days.map((date, index) => {
        const day = data.activity.find(activity => activity.date === date);
        const progress = percent(day);
        const label = `${WEEKDAYS[index]}: ${date > data.today ? 'будущий день' : progress + '%'}`;
        return <div role="listitem" className="bar-day" key={date} aria-label={label} title={label}>
          <div className="bar-track">
            {date <= data.today && <div className={date === data.today ? 'bar-fill current' : 'bar-fill'} style={{ height: progress + '%' }} />}
          </div><span>{WEEKDAYS[index]}</span>
        </div>;
      })}
    </div>
    <div className="chart-footer"><span><i /> Выполнено за неделю</span><strong>{totals.percent}%</strong></div>
    {showSelectedWeek && selectedDay && <DailyNote key={selectedDay.date} day={selectedDay} today={data.today} />}
  </section>;
}

export function CalendarView({ data, select }: { data: Dashboard; select: (date: string) => void }) {
  const month = data.selected.slice(0, 7);
  const days = data.activity.filter(day => day.date.startsWith(month));
  const padding = (parseDate(month + '-01').getDay() + 6) % 7;
  return <section className="panel calendar-panel">
    <div className="panel-heading"><div><h2 className="capitalize">{formatDate(data.selected, { month: 'long', year: 'numeric' })}</h2>
      <p>Выбери дату, чтобы посмотреть привычки и изменить отметки.</p></div>
      <div className="calendar-actions">
        <button className="icon-button outline" type="button" aria-label="Предыдущий месяц" onClick={() => select(shiftMonth(data.selected, -1))}><Icon name="left" size={17} /></button>
        <button className="button soft" type="button" onClick={() => select(data.today)}>Сегодня</button>
        <button className="icon-button outline" type="button" aria-label="Следующий месяц" onClick={() => select(shiftMonth(data.selected, 1))}><Icon name="right" size={17} /></button>
      </div>
    </div>
    <div className="calendar-grid">
      {WEEKDAYS.map(day => <span className="calendar-weekday" key={day}>{day}</span>)}
      {Array.from({ length: padding }, (_, index) => <span key={index} />)}
      {days.map(day => <button type="button" key={day.date}
        className={`calendar-day level-${Math.ceil(percent(day) / 25)}${day.date === data.selected ? ' is-selected' : ''}`}
        aria-pressed={day.date === data.selected}
        aria-label={`${formatDate(day.date, { day: 'numeric', month: 'long' })}: ${day.completed} из ${day.scheduled}`}
        onClick={() => select(day.date)}>
        <strong>{parseDate(day.date).getDate()}</strong>
        <span>{day.date > data.today ? '·' : `${day.completed}/${day.scheduled}`}</span>
      </button>)}
    </div>
    <div className="calendar-legend"><span>Меньше</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`level-${level}`} />)}<span>Больше</span></div>
  </section>;
}

export function StatsView({ data, select }: { data: Dashboard; select: (date: string) => void }) {
  const best = data.habits.reduce((max, habit) => Math.max(max, habit.best_streak), 0);
  return <>
    <div className="statistics-grid">
      <section className="panel metric"><span className="panel-icon"><Icon name="chart" /></span><h2>Текущая неделя</h2>
        <strong>{data.week.percent}%</strong><p>{data.week.completed} из {data.week.scheduled} выполнено</p></section>
      <section className="panel metric"><span className="panel-icon"><Icon name="calendar" /></span>
        <h2 className="capitalize">{formatDate(data.selected, { month: 'long', year: 'numeric' })}</h2>
        <strong>{data.month.percent}%</strong><p>{data.month.completed} из {data.month.scheduled} выполнено</p></section>
      <section className="panel metric"><span className="panel-icon"><Icon name="fire" /></span><h2>Лучшая серия</h2>
        <strong>{best}</strong><p>выполнений подряд</p></section>
    </div>
    <div className="calendar-actions section-actions">
      <button className="icon-button outline" type="button" aria-label="Предыдущий месяц" onClick={() => select(shiftMonth(data.selected, -1))}><Icon name="left" size={17} /></button>
      <button className="button soft" type="button" onClick={() => select(data.today)}>Текущий месяц</button>
      <button className="icon-button outline" type="button" aria-label="Следующий месяц" onClick={() => select(shiftMonth(data.selected, 1))}><Icon name="right" size={17} /></button>
    </div>
    <WeekChart data={data} expanded />
  </>;
}
