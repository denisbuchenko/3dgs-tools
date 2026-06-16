# 3dgs-tools

Минимальный workspace с раздельными `client` и `server`.

## Запуск

```bash
npm install
npm run dev:server
npm run dev:client
```

По умолчанию:

- сервер: `http://localhost:3000`
- клиент: `http://localhost:5173`

## gsplat

Backend при запуске сам готовит Gaussian Splatting окружение. Он сначала ищет Nerfstudio CLI (`ns-process-data`, `ns-train` и `ns-export`), проверяет CUDA/PyTorch/gsplat runtime и прогревает CUDA backend. Пока runtime не готов, клиент показывает статус подготовки и не запускает project job.

После готовности backend project job готовит Nerfstudio dataset из уже рассчитанных COLMAP-данных проекта, запускает `splatfacto`, а затем экспортирует `.ply`. Если Nerfstudio не найден, backend создаст локальное окружение `server/tools/nerfstudio` и попробует установить Nerfstudio автоматически.

Дефолтный training profile рассчитан на GPU около 8GB VRAM: используется обычный `splatfacto`, изображения кэшируются на CPU, full-image eval во время обучения отключён, а разрешение и densification ограничены настройками качества. Это убирает типичный OOM на `Eval Images`, который не нужен для получения итогового `.ply`.

Nerfstudio `splatfacto` требует рабочую NVIDIA CUDA GPU. Проверьте драйвер перед обучением:

```bash
nvidia-smi
```

Если команда пишет, что не может связаться с NVIDIA driver, нужно установить или починить драйвер NVIDIA и перезапустить backend.

Для ручной подготовки одной командой:

```bash
npm run setup:gsplat
```

Если Python venv/pip отсутствуют, сначала выполните:

```bash
sudo apt install -y python3-pip python3-venv python3.10-venv python3-dev build-essential git ninja-build
```

Если нужен другой trainer, можно задать внешний бинарь через `GSPLAT_BIN`:

```bash
GSPLAT_BIN=/path/to/gsplat npm run dev:server
```

Если нужна другая директория для локального окружения:

```bash
GSPLAT_VENV=/path/to/venv npm run dev:server
```

Если нужно зафиксировать пакет/версию для автоматической установки:

```bash
GSPLAT_BOOTSTRAP_PACKAGE='nerfstudio==1.1.5' npm run dev:server
```

Если установленный trainer использует другие аргументы, можно переопределить весь шаблон:

```bash
GSPLAT_ARGS='train --data {dataPath} --output-dir {workspace} --output-ply {plyPath} --max-steps {maxSteps}' npm run dev:server
```

Для Python trainer:

```bash
GSPLAT_BIN=/usr/bin/python3 GSPLAT_ARGS='/path/to/train.py --data {dataPath} --output-dir {workspace} --output-ply {plyPath} --max-steps {maxSteps}' npm run dev:server
```

Доступные placeholders: `{dataPath}`, `{imagePath}`, `{colmapWorkspace}`, `{sparsePath}`, `{workspace}`, `{plyPath}`, `{maxSteps}`, `{resolution}`, `{shDegree}`, `{downscaleFactor}`, `{background}`, `{quality}`, `{gpuIndex}`, `{densificationInterval}`, `{opacityRegularization}`.

## Сборка

```bash
npm run build
```
