# ai-custdev-cli
Консольное приложение для проведения массовых глубинных интервью с синтетическими пользователями (AI-персонами). Система принимает JSON-конфиг проекта и прогоняет три этапа: генерация персон, симуляция интервью, аналитика и агрегация.

## Требования
- Node.js 18+
- OpenRouter API ключ

## Changelog
Список изменений: `CHANGELOG.md`.

## Быстрый старт
```bash
npm install
copy .env.example .env
# заполнить OPENROUTER_API_KEY
npm start -- --project demo_cooking --run-tag demo
```
Подробная пошаговая инструкция: `RUN_GUIDE.md`.

## Команды
- `npm start -- --project <name>`: полный цикл (generate -> simulate -> analyze).
- `npm start -- --project <name> --skip-generate`: пропустить генерацию персон.
- `npm start -- --project <name> --skip-simulate`: пропустить симуляцию интервью.
- `npm start -- --project <name> --skip-analyze`: пропустить аналитику.
- `npm start -- --project <name> --run-tag smoke --run-tag v1`: добавить теги в имя папки запуска.
- `npm start -- --project <name> --run-name-auto`: сгенерировать имя папки запуска через LLM.
- `npm start -- --project <name> --run-name "<title>"`: задать имя папки запуска вручную.
- `npm start -- --project <name> --interviewer-mode llm`: включить LLM-интервьюера (по умолчанию `script`).
- `npm start -- --project <name> --lang <lang>`: переопределить язык вывода (по умолчанию `ru`).
- `npm start -- --project <name> --check-key`: проверить статус ключа OpenRouter перед запуском.
- `npm start -- --project <name> --yes`: пропустить подтверждение запуска.
- `npm start -- --project <name> --skip-advice`: не делать пост-совет.
- `npm start -- --project <name> --advice-model <model>`: модель для пост-совета.
- `npm run build`: сборка TypeScript.
- `npm test`: запуск минимального набора тестов.

## UX запуска
Перед стартом CLI показывает параметры прогона, оценку числа запросов, токенов,
времени и стоимости (если известна), затем просит подтверждение. Для пропуска
подтверждения используйте `--yes`.

## Fallback модели
Если анализатор не вернул корректный JSON, CLI пробует повторить запрос на
других моделях из `config/fallback-models.json`. Можно редактировать этот файл
и указывать любые доступные модели.


## Структура проекта
- `config/projects/*.json`: конфиги проектов.
- `input/`: промпты для генератора, интервьюера, респондента и аналитика.
- `output/<project>/<run>/`: артефакты выполнения (gitignored).
- `src/`: исходный код CLI и модулей.

## Гайд по формированию входных параметров
Конфиг проекта хранится в `config/projects/<name>.json`. Минимальная структура:
- `meta`: название и описание задачи.
- `settings`: число персон (`iterations`), параллелизм (`concurrency`), язык (`lang`, по умолчанию `ru`).
- `models`: модели для генератора, респондента и аналитика.
- `segments`: сегменты пользователей (персоны).
- `interviewFlow`: общий контекст и список вопросов.
- `analyticsSchema`: поля аналитики (колонки CSV).
Язык `settings.lang` используется во всех текстовых результатах (персоны, интервью, аналитика, рекомендации). Вопросы в `interviewFlow.script` тоже стоит писать на нужном языке.
Дополнительно можно включить LLM-интервьюера:
- `interviewFlow.interviewerMode`: `script` (по умолчанию) или `llm`.

Дополнительно можно задать модель для пост-совета:
- `models.advisor`: модель, которая формирует рекомендации после анализа.

Дополнительные подсказки для сегментов:
- `tooling`: предпочитаемые инструменты/источники.
- `painPoints`: типовые боли.
- `cadence`: типичная частота операций.

Пример для приложения по валютному арбитражу (10 респондентов):
```json
{
  "meta": {
    "projectName": "arbitrage_exchange",
    "description": "Исследование спроса на приложение для офлайн арбитража обменников: подбор пунктов с нужными купюрами, выгодным курсом, построение маршрутов и оценка прибыли в час."
  },
  "settings": {
    "iterations": 10,
    "concurrency": 2,
    "lang": "ru"
  },
  "models": {
    "generator": "mistralai/mistral-7b-instruct:free",
    "interviewer": "mistralai/mistral-7b-instruct:free",
    "respondent": "mistralai/mistral-7b-instruct:free",
    "analyzer": "mistralai/mistral-7b-instruct:free"
  },
  "segments": [
    {
      "id": "arbitrage_pro",
      "name": "Опытные арбитражники",
      "weight": 0.4,
      "traits": [
        "Высокая частота сделок",
        "Чувствительность к курсу",
        "Планирование маршрутов",
        "Работа с наличными"
      ],
      "tooling": ["BestChange", "Google Sheets", "Telegram-каналы"],
      "painPoints": [
        "Нехватка нужных купюр",
        "Расхождение курса на месте",
        "Потери времени на маршрутизацию"
      ],
      "cadence": "ежедневно или несколько раз в неделю"
    },
    {
      "id": "tourist",
      "name": "Туристы",
      "weight": 0.3,
      "traits": [
        "Редкие обмены",
        "Ограниченный бюджет",
        "Страх мошенничества",
        "Ориентация на удобство"
      ],
      "tooling": ["Google Maps", "советы от отеля", "офлайн рекомендации"],
      "painPoints": ["Скрытые комиссии", "Надежность обменника", "Нужные купюры"],
      "cadence": "разово в поездке"
    },
    {
      "id": "emigrant",
      "name": "Эмигранты и релоканты",
      "weight": 0.3,
      "traits": [
        "Регулярные конверсии",
        "Фокус на надежность",
        "Переводы на родину",
        "Нужны крупные суммы"
      ],
      "tooling": ["чаты в мессенджерах", "рекомендованные обменники", "таблицы учета"],
      "painPoints": [
        "Курсовая потеря",
        "Надежность контрагента",
        "Долгие маршруты"
      ],
      "cadence": "ежемесячно или по зарплате"
    }
  ],
  "interviewFlow": {
    "context": "Вы участвуете в интервью как пользователь. Вы не знаете продукт заранее. Отвечайте честно и конкретно.",
    "interviewerMode": "script",
    "script": [
      "Расскажите о вашем опыте обмена валюты офлайн за последние 3 месяца.",
      "Представьте приложение, которое показывает выгодные обменники с нужными купюрами, строит маршруты и оценивает прибыль/время для арбитража. Пользовались бы вы им? Почему?",
      "Какие функции для вас критичны в таком приложении?",
      "Что вызывает недоверие или риски при использовании подобного сервиса?",
      "Порекомендовали бы вы это приложение друзьям или коллегам? Почему?"
    ]
  },
  "analyticsSchema": [
    {
      "key": "would_use",
      "description": "Пользовался бы пользователь приложением? Краткий ответ."
    },
    {
      "key": "needed_features",
      "description": "Какие функции пользователь считает критичными?"
    },
    {
      "key": "trust_risks",
      "description": "Какие риски или недоверие упоминает пользователь?"
    },
    {
      "key": "recommendation",
      "description": "Готов ли рекомендовать приложение и почему?"
    },
    {
      "key": "value_metric",
      "description": "Какая ценность важнее: курс, купюры, скорость маршрута, прибыль/час?"
    }
  ]
}
```

## Demo сетап
Для демонстрации можно использовать микс моделей:
- `generator`: `deepseek/deepseek-r1-0528:free`
- `respondent`: `mistralai/mistral-7b-instruct:free`
- `analyzer`: `mistralai/mistral-7b-instruct:free`
- `interviewer`: `mistralai/mistral-7b-instruct:free` (если включаете `interviewerMode: "llm"`)

Синтетическая задача для cooking-приложения:
- Конфиг: `config/projects/demo_cooking.json`
- Запуск: `npm start -- --project demo_cooking --run-tag demo`
- Единый эталонный вход/выход: `QUICKSTART.md`

## Выходные данные
- `output/<project>/<run>/personas.json`: сгенерированные персоны.
- `output/<project>/<run>/logs/*.json`: логи интервью сессий.
- `output/<project>/<run>/analysis.csv`: агрегированная аналитика.
- `output/<project>/<run>/summary.json`: сводка по сегментам + список персон с метриками.
- `output/<project>/<run>/advice.md`: рекомендации по улучшению параметров прогона.
- `output/<project>/<run>/app.log`: журнал выполнения.




