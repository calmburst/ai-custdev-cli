# Quickstart (демо)

Этот документ описывает эталонный вход и эталонный выход для демонстрации
полного цикла работы CLI.

## Эталонный вход
- Конфиг проекта: `config/projects/demo_cooking.json`
- Сценарий: приложение для планирования готовки, подбора рецептов,
  списков покупок и замен.

## Запуск
```bash
npm install
copy .env.example .env
# заполнить OPENROUTER_API_KEY
npm start -- --project demo_cooking --run-tag demo
```

Во время запуска CLI показывает параметры, оценку запросов/токенов/времени
и выводит прогресс выполнения.
Подробная пошаговая инструкция: `RUN_GUIDE.md`.

## Эталонный выход
Сохранен в `tests/fixtures/demo_cooking/expected/` и включает:
- `personas.json`
- `logs/*.json`
- `analysis.csv`
- `summary.json`
- `advice.md`
- `app.log`

Важно: вывод LLM недетерминирован, поэтому эталонный набор служит
ориентиром по формату и полноте артефактов, а не точному содержанию.

## Результат
В директории output:
- `output/<project>/<run>/`: артефакты выполнения (gitignored).
