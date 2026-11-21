# Публикация «Пути» на PythonAnywhere

Для небольшого портфолио подходит тариф [Beginner](https://www.pythonanywhere.com/pricing/). На нём доступен один сайт. Публикацию нужно [продлевать раз в месяц](https://help.pythonanywhere.com/pages/FreeAccountsFeatures/). Поддержка FastAPI на платформе работает в режиме [ASGI beta](https://help.pythonanywhere.com/pages/ASGICommandLine/).

## Подготовка аккаунта

1. Создай [бесплатный аккаунт Beginner](https://www.pythonanywhere.com/registration/register/beginner/) или войди в свой аккаунт. Для европейского аккаунта используй свой поддомен с окончанием `.eu.pythonanywhere.com`.
2. В разделе **Account → API token** создай токен. Консоль PythonAnywhere подхватит его сама. После создания токена открой новую Bash-консоль.
3. В разделе **Files** загрузи `put-pythonanywhere.zip` в домашнюю папку. Архив содержит собранный интерфейс. Установку Node.js на сервере можно пропустить.

## Развёртывание

В Bash-консоли PythonAnywhere выполни:

```bash
unzip -n "$HOME/put-pythonanywhere.zip" -d "$HOME/put-app"
mkdir -p "$HOME/.virtualenvs"
python3.13 -m venv "$HOME/.virtualenvs/put"
"$HOME/.virtualenvs/put/bin/python" -m pip install -r "$HOME/put-app/requirements.txt"
python3.13 -m pip install --user --upgrade pythonanywhere
```

Подставь свой адрес в первую строку:

```bash
habit_domain='YOURUSERNAME.pythonanywhere.com'
"$HOME/.local/bin/pa" website create --domain "$habit_domain" \
  --command "$HOME/.virtualenvs/put/bin/python $HOME/put-app/deploy/start_pythonanywhere.py $habit_domain"
"$HOME/.local/bin/pa" website get --domain "$habit_domain"
```

Открой `https://YOURUSERNAME.pythonanywhere.com/health` и проверь ответ `{"status":"ok"}`. Затем открой главную страницу по HTTPS. Если посетитель откроет главную по HTTP, браузер переключится на HTTPS до загрузки интерфейса. Для портфолио используй ссылку с `https://`.

Сценарий проверки сохранения прогресса. Зарегистрируй тестовый аккаунт, добавь привычку, отметь её, выйди и войди снова. Для проверки перезапусти сайт через `pa website reload --domain "$habit_domain"` и снова открой приложение.

## Где хранятся данные

База создаётся в домашней папке сервера по пути `~/put-data/habits.sqlite3`, отдельно от кода. При первой публикации она пустая. Можно сделать резервную копию через SQLite Backup API. У SQLite на сетевом диске ограничения по нагрузке. Для портфолио предполагается один процесс Uvicorn на бесплатном тарифе. Подробности есть в [документации провайдера](https://help.pythonanywhere.com/pages/MySiteIsSlow/).
