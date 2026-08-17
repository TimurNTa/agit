# AGIT

Закрытая система полевых заданий и фотоотчётов для агитаторов.

## Что уже есть

- вход агитатора через персональную ссылку, которую выдаёт VK-бот;
- карта домов на Leaflet/OpenStreetMap;
- геопозиция в момент начала отчёта и проверка расстояния до дома;
- приём фотографий через сообщения сообщества VK (`message_new`);
- временное хранение оригиналов на сервере вне public-директории;
- админ-панель: агитаторы, дома, назначения, просмотр и приём/отклонение отчётов;
- выгрузка фотографий ZIP;
- отдельное подтверждение выгрузки и только после него — физическое удаление фото;
- защита Callback API по `group_id` + secret и дедупликация VK-событий.

## Домен и Callback

- приложение: `https://agit.volochek69.ru`
- админка: `https://agit.volochek69.ru/admin`
- VK Callback: `https://agit.volochek69.ru/api/vk/callback`
- VK group ID: `240908156`

## Стек

Next.js 16 / React 19 / TypeScript / Prisma 7 / PostgreSQL / Leaflet / React Leaflet.

Карта вынесена в `src/components/map`, чтобы дальше спокойно перенести нужные UX-решения из «Округ Онлайн» без сцепления с остальным приложением.

## Развёртывание

На VPS от root:

```bash
curl -fsSL https://raw.githubusercontent.com/TimurNTa/agit/main/deploy/bootstrap.sh | bash
```

После первого запуска открой `/var/www/agit/.env` и заполни:

```env
VK_GROUP_TOKEN=
VK_CALLBACK_SECRET=
VK_CONFIRMATION_TOKEN=
ADMIN_PASSWORD=
```

Затем:

```bash
systemctl restart agit
```

После этого в VK Callback API укажи адрес `https://agit.volochek69.ru/api/vk/callback` и нажми «Подтвердить».

## Хранение фото

Файлы лежат в `/var/lib/agit/photos/<report-id>/`. В веб-папку они не попадают. Просмотр идёт только через защищённый admin endpoint.

Порядок удаления намеренно двухэтапный:

1. `Скачать ZIP`.
2. `Подтвердить выгрузку`.
3. `Удалить выгруженные фото`.

Так фотографии не исчезнут только из-за факта открытия ссылки на ZIP.

## Обновление

Та же короткая команда безопасно подтягивает `main`, применяет миграции, пересобирает приложение и перезапускает сервис:

```bash
curl -fsSL https://raw.githubusercontent.com/TimurNTa/agit/main/deploy/bootstrap.sh | bash
```
