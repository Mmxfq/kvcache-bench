---
sidebar_position: 2
title: NVIDIA（待测）
---

# NVIDIA · 完整复现代码与结果（待测）

:::info 状态：规划中
本页提供 NVIDIA 平台的完整可复现代码（已按平台适配）。完成测试后将结果占位符替换为实测值。方法学原理见[标准化规范](../spec.md)。
:::

## 0. 平台适配信息

| 维度 | 取值 |
|---|---|
| 容器镜像 | `vllm/vllm-openai:latest`（或 NGC `nvcr.io/nvidia/...`） |
| 设备挂载 | `--gpus all`（需 nvidia-container-toolkit） |
| 监控工具 | `nvidia-smi` |
| 专用环境变量 | 通常无 |
| GPU KV 容量 | _待实测_ token |

## 1. 环境准备（一次性）

```bash
# (0-a) [宿主] 监控依赖 + nvidia-container-toolkit（按官方文档安装）
apt-get update && apt-get install -y sysstat

# (0-b) [宿主] 远端存储 RAID0 + 挂载（按实际盘符）
mdadm --create /dev/md0 --level=0 --raid-devices=4 /dev/nvme2n1 /dev/nvme3n1 /dev/nvme4n1 /dev/nvme5n1 --chunk=512
mkfs.xfs /dev/md0 && mkdir -p /mnt/ws5000 && mount /dev/md0 /mnt/ws5000 && mkdir -p /mnt/ws5000/lmcache

# (0-c) [宿主] 创建推理容器
IMG=vllm/vllm-openai:latest
docker run -itd --name vllm --network=host --gpus all --ipc=host \
  --shm-size 100gb --ulimit memlock=-1 \
  -v /data/models:/root/models -v /mnt/ws5000:/mnt/ws5000 \
  $IMG sleep infinity

# (0-d) [容器] 下载模型
docker exec vllm bash -lc "HF_ENDPOINT=https://hf-mirror.com hf download Qwen/Qwen2.5-7B-Instruct --local-dir /root/models/Qwen2.5-7B-Instruct"

# (0-e) [容器] 写入 benchcap_full.py（源码与沐曦页第 2 节完全一致，原样复制）
```

## 2. 测试脚本 benchcap_full.py

**与[沐曦页第 2 节](./metax.md)完全一致，厂商无关，原样复制使用。**

## 3. 编排脚本 run_tiers.sh（NVIDIA 适配）

相对沐曦版仅两处改动：`restart()` 用 `nvidia-smi` 查显存；起服环境变量去掉 `MACA_GRAPH_LAUNCH_MODE`。

```bash
#!/bin/bash
say(){ echo "[$(date +%H:%M:%S)] $*"; }

wait_ready(){
  for i in $(seq 1 90); do
    if docker exec vllm bash -lc "python -c \"import urllib.request,sys; sys.exit(0 if 'Qwen' in urllib.request.urlopen('http://localhost:8000/v1/models',timeout=3).read().decode() else 1)\"" 2>/dev/null; then say READY; return 0; fi
    sleep 5
  done; say TIMEOUT; return 1
}

restart(){
  docker exec vllm bash -lc "pkill -9 -f 'vllm serve' 2>/dev/null; pkill -9 -f benchcap 2>/dev/null" 2>/dev/null
  docker restart vllm >/dev/null; sleep 14
  say "GPU mem used: $(docker exec vllm bash -lc "nvidia-smi --query-gpu=memory.used --format=csv,noheader")"
}

run_tier(){
  TIER=$1; DISKENV=$2; IODEV=$3
  say "===== TIER $TIER start ====="
  restart
  docker exec vllm bash -lc "rm -rf /mnt/ws5000/lmcache; mkdir -p /mnt/ws5000/lmcache; rm -rf /root/models/lmcache_local; mkdir -p /root/models/lmcache_local"
  docker exec -d vllm bash -lc "export PYTHONHASHSEED=0 LMCACHE_LOG_LEVEL=INFO LMCACHE_CHUNK_SIZE=256 LMCACHE_LOCAL_CPU=True LMCACHE_MAX_LOCAL_CPU_SIZE=8 $DISKENV; vllm serve /root/models/Qwen2.5-7B-Instruct --dtype bfloat16 --max-model-len 32768 --gpu-memory-utilization 0.9 --enable-prefix-caching --kv-transfer-config '{\"kv_connector\":\"LMCacheConnectorV1\",\"kv_role\":\"kv_both\"}' --port 8000 > /root/models/vllm_k26${TIER}.log 2>&1"
  wait_ready || return 1
  say "populate (会话数按本机容量重设，见标准化规范 §4)..."
  docker exec vllm bash -lc "python /root/benchcap_full.py k26${TIER}_pp 500 100 populate 1 1"
  MARK=$(docker exec vllm bash -lc "wc -l < /root/models/vllm_k26${TIER}.log")
  say "drop_caches..."; sync; echo 3 > /proc/sys/vm/drop_caches
  IOP=""
  if [ -n "$IODEV" ]; then nohup bash -c "iostat -x 2 240 $IODEV > /tmp/iostat_k26${TIER}.log 2>&1" >/dev/null 2>&1 & IOP=$!; fi
  docker exec vllm bash -lc "python /root/benchcap_full.py k26${TIER} 500 64 measure 512 16"
  [ -n "$IOP" ] && kill $IOP 2>/dev/null
  NL=$(docker exec vllm bash -lc "tail -n +$MARK /root/models/vllm_k26${TIER}.log | grep -aE 'need to load:' | grep -av 'need to load: 0' | wc -l")
  say "TIER $TIER need-to-load>0=$NL; json=$(docker exec vllm bash -lc "cat /mnt/ws5000/results/k26${TIER}.json|tr '\n' ' '")"
  if [ -n "$IODEV" ]; then D=$(basename $IODEV); say "$D peak rkB/s: $(awk -v d=$D '$1==d{print $3}' /tmp/iostat_k26${TIER}.log|sort -n|tail -3|tr '\n' ' ')"; fi
  say "===== TIER $TIER done ====="
}

run_tier D "LMCACHE_LOCAL_DISK='file:///mnt/ws5000/lmcache' LMCACHE_MAX_LOCAL_DISK_SIZE=300" /dev/md0
run_tier E "LMCACHE_LOCAL_DISK='file:///root/models/lmcache_local' LMCACHE_MAX_LOCAL_DISK_SIZE=300" /dev/nvme0n1
run_tier A "" ""
say "########## ALL THREE DONE ##########"
```

> **注**：NVIDIA 平台可进一步评估启用 GDS（GPUDirect Storage）以绕过 host 中转、提升回读带宽（LMCache GDS 后端依赖 cufile）。

## 4. 容量基准（必填）

| 档位 | GPU KV 容量 | 单会话 token | C_GPU | 选定 M（GPU命中/超容量/populate） |
|---|---|---|---|---|
| 8K | _待填_ | 7,827 | _待算_ | _ / _ / _ |
| 26K | _待填_ | 26,028 | _待算_ | _ / _ / _ |

## 5. 实测结果（待填）

### 5.1 26K 物理读三档

| 指标 | ① GPU 命中 | ② 远端存储(物理) | ②′ 本地NVMe(物理) | ③ 重算 |
|---|---|---|---|---|
| TTFT p50 | _ | _ | _ | _ |
| TTFT p99 | _ | _ | _ | _ |
| TPOT p50 | _ | _ | _ | _ |
| 输出吞吐 | _ | _ | _ | _ |
| 命中验证 | need-to-load=0 | _/_ 全物理 | _/_ 全物理 | 0 盘读 |
| 物理读峰值 | — | _ GB/s | _ GB/s | — |

### 有效性校验
- 完成后须过[标准化规范 §10 有效性校验清单](../spec.md)全部 A–F 项。
