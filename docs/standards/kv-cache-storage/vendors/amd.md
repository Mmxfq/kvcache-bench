---
sidebar_position: 3
title: AMD（待测）
---

# AMD ROCm · 完整复现代码与结果（待测）

:::info 状态：规划中
本页提供 AMD ROCm 平台的完整可复现代码（已按平台适配）。方法学原理见[标准化规范](../spec.md)。
:::

## 0. 平台适配信息

| 维度 | 取值 |
|---|---|
| 容器镜像 | `rocm/vllm:latest` |
| 设备挂载 | `--device=/dev/kfd --device=/dev/dri --group-add video` |
| 监控工具 | `rocm-smi` |
| 专用环境变量 | `HIP_VISIBLE_DEVICES` 等（按需） |
| GPU KV 容量 | _待实测_ token |

## 1. 环境准备（一次性）

```bash
apt-get update && apt-get install -y sysstat
mdadm --create /dev/md0 --level=0 --raid-devices=4 /dev/nvme2n1 /dev/nvme3n1 /dev/nvme4n1 /dev/nvme5n1 --chunk=512
mkfs.xfs /dev/md0 && mkdir -p /mnt/ws5000 && mount /dev/md0 /mnt/ws5000 && mkdir -p /mnt/ws5000/lmcache

IMG=rocm/vllm:latest
docker run -itd --name vllm --network=host \
  --device=/dev/kfd --device=/dev/dri --group-add video \
  --security-opt seccomp=unconfined --shm-size 100gb --ulimit memlock=-1 \
  -v /data/models:/root/models -v /mnt/ws5000:/mnt/ws5000 \
  $IMG sleep infinity

docker exec vllm bash -lc "HF_ENDPOINT=https://hf-mirror.com hf download Qwen/Qwen2.5-7B-Instruct --local-dir /root/models/Qwen2.5-7B-Instruct"
```

## 2. 测试脚本 benchcap_full.py

**与[沐曦页第 2 节](./metax.md)完全一致，厂商无关，原样复制使用。**

## 3. 编排脚本 run_tiers.sh（AMD 适配）

相对沐曦版仅改动：`restart()` 用 `rocm-smi` 查显存；起服环境变量去掉 `MACA_GRAPH_LAUNCH_MODE`（按需加 `HIP_VISIBLE_DEVICES`）。其余（四档逻辑、populate/measure、取证）完全一致。

```bash
restart(){
  docker exec vllm bash -lc "pkill -9 -f 'vllm serve' 2>/dev/null; pkill -9 -f benchcap 2>/dev/null" 2>/dev/null
  docker restart vllm >/dev/null; sleep 14
  say "GPU mem: $(docker exec vllm bash -lc "rocm-smi --showmeminfo vram | grep -i used")"
}
# 起服环境变量（去掉 MACA 专用项）：
# export PYTHONHASHSEED=0 LMCACHE_LOG_LEVEL=INFO LMCACHE_CHUNK_SIZE=256 LMCACHE_LOCAL_CPU=True LMCACHE_MAX_LOCAL_CPU_SIZE=8 $DISKENV
# 其余 run_tier 主体、三档调用与沐曦页第 3 节一致，原样复制。
```

## 4. 容量基准（必填）

| 档位 | GPU KV 容量 | 单会话 token | C_GPU | 选定 M |
|---|---|---|---|---|
| 8K | _待填_ | 7,827 | _待算_ | _ |
| 26K | _待填_ | 26,028 | _待算_ | _ |

## 5. 实测结果（待填）

| 指标 | ① GPU 命中 | ② 远端存储(物理) | ②′ 本地NVMe(物理) | ③ 重算 |
|---|---|---|---|---|
| TTFT p50 | _ | _ | _ | _ |
| 输出吞吐 | _ | _ | _ | _ |
| 命中验证 | need-to-load=0 | _/_ 全物理 | _/_ 全物理 | 0 盘读 |
| 物理读峰值 | — | _ GB/s | _ GB/s | — |

### 有效性校验
- 完成后须过[标准化规范 §10 有效性校验清单](../spec.md)全部 A–F 项。
