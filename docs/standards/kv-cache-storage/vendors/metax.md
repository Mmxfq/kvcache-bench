---
sidebar_position: 1
title: 沐曦 MetaX
---

# 沐曦 MetaX N260 · 完整复现代码与结果

本页是沐曦 MetaX 平台的完整可复现代码与实测结果。方法学原理见[标准化规范](../spec.md)。

## 0. 平台适配信息

| 维度 | 取值 |
|---|---|
| 容器镜像 | `cr.metax-tech.com/public-ai-release/maca/vllm-metax:0.20.0-maca.ai3.7.0.107-torch2.8-py310-ubuntu22.04-amd64` |
| 设备挂载 | `--device=/dev/dri --device=/dev/mxcd --device=/dev/mem` |
| 监控工具 | `mx-smi` |
| 专用环境变量 | `MACA_GRAPH_LAUNCH_MODE=1` |
| GPU KV 容量 | 774,704 token（gpu_util=0.9） |

## 1. 环境准备（一次性）

```bash
# (0-a) [宿主] 监控依赖
apt-get update && apt-get install -y sysstat

# (0-b) [宿主] 远端存储 AISSD5000 四盘 RAID0 + 挂载（按实际盘符）
mdadm --create /dev/md0 --level=0 --raid-devices=4 /dev/nvme2n1 /dev/nvme3n1 /dev/nvme4n1 /dev/nvme5n1 --chunk=512
mkfs.xfs /dev/md0 && mkdir -p /mnt/ws5000 && mount /dev/md0 /mnt/ws5000 && mkdir -p /mnt/ws5000/lmcache

# (0-c) [宿主] 创建推理容器
IMG=cr.metax-tech.com/public-ai-release/maca/vllm-metax:0.20.0-maca.ai3.7.0.107-torch2.8-py310-ubuntu22.04-amd64
docker run -itd --name vllm --network=host \
  --device=/dev/dri --device=/dev/mxcd --device=/dev/mem \
  --group-add video --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  --shm-size 100gb --ulimit memlock=-1 -e MACA_GRAPH_LAUNCH_MODE=1 \
  -v /data/models:/root/models -v /mnt/ws5000:/mnt/ws5000 \
  $IMG sleep infinity

# (0-d) [容器] 下载模型
docker exec vllm bash -lc "HF_ENDPOINT=https://hf-mirror.com hf download Qwen/Qwen2.5-7B-Instruct --local-dir /root/models/Qwen2.5-7B-Instruct"

# (0-e) [容器] 写入测试脚本 benchcap_full.py（源码见第 2 节）
```

## 2. 测试脚本 benchcap_full.py

厂商无关、零外部依赖。用法：`python benchcap_full.py <label> <reps> <N> <populate|measure> [decode=512] [conc=16]`

```python
import urllib.request, json, time, sys, os
from concurrent.futures import ThreadPoolExecutor
BASE="http://localhost:8000/v1/chat/completions"
MODEL="/root/models/Qwen2.5-7B-Instruct"
label=sys.argv[1]; reps=int(sys.argv[2]); N=int(sys.argv[3]); mode=sys.argv[4]
decode=int(sys.argv[5]) if len(sys.argv)>5 else 512
conc=int(sys.argv[6]) if len(sys.argv)>6 else 16
basep="背景知识：大模型推理用 vLLM + LMCache 把 KV 分层卸载到外部存储，用于 KV 缓存回读基准测试。"
def make_prefix(i): return "[sess-%05d] "%i + basep*reps
def req(sid, maxtok):
    body=json.dumps({"model":MODEL,"stream":True,"messages":[{"role":"system","content":make_prefix(sid)},{"role":"user","content":"回答%d"%sid}],"max_tokens":maxtok,"temperature":0}).encode()
    st=time.time(); ttft=None; n=0
    try:
        r=urllib.request.urlopen(urllib.request.Request(BASE,data=body,headers={"Content-Type":"application/json"}),timeout=600)
        for line in r:
            sx=line.decode("utf-8","ignore")
            if sx.startswith("data:") and '"content"' in sx:
                if ttft is None: ttft=time.time()-st
                n+=1
        return (ttft, time.time()-st, n)
    except Exception:
        return (None,None,0)
def pct(a,q): return a[min(len(a)-1,int(len(a)*q))] if a else 0.0
if mode=="populate":
    t0=time.time()
    for i in range(N): req(i,1)
    print("[%s] populate N=%d wall=%.1fs"%(label,N,time.time()-t0)); sys.exit(0)
res=[]; t0=time.time()
with ThreadPoolExecutor(max_workers=conc) as ex:
    futs=[ex.submit(req,i,decode) for i in range(N)]
    for f in futs:
        x=f.result()
        if x[0] is not None: res.append(x)
wall=time.time()-t0
tt=sorted(r[0] for r in res)
tpots=sorted((r[1]-r[0])/(r[2]-1) for r in res if r[2]>1)
tot=sum(r[2] for r in res)
summ={"label":label,"n":len(res),"decode":decode,"conc":conc,"wall_s":round(wall,1),
 "ttft_p50":round(pct(tt,.5),3),"ttft_p90":round(pct(tt,.9),3),"ttft_p99":round(pct(tt,.99),3),"ttft_mean":round(sum(tt)/len(tt),3),
 "tpot_p50_ms":round(pct(tpots,.5)*1000,1),"req_s":round(len(res)/wall,2),"out_tok_s":round(tot/wall,1)}
print("[%s] n=%d wall=%.1fs TTFT p50=%.3f p90=%.3f p99=%.3f | TPOT p50=%.1fms | req/s=%.2f out_tok/s=%.1f"%(label,summ["n"],wall,summ["ttft_p50"],summ["ttft_p90"],summ["ttft_p99"],summ["tpot_p50_ms"],summ["req_s"],summ["out_tok_s"]))
os.makedirs("/mnt/ws5000/results",exist_ok=True)
json.dump(summ,open("/mnt/ws5000/results/%s.json"%label,"w"),ensure_ascii=False,indent=2)
print("DONE")
```

## 3. 编排脚本 run_tiers.sh（物理读三档）

宿主机运行，用 `setsid` 后台启动，日志落宿主路径：

```bash
setsid bash run_tiers.sh > /root/run_tiers.out 2>&1 < /dev/null &
```

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
  say "GPU after restart: $(docker exec vllm bash -lc "mx-smi|tr '\r' '\n'|grep '/65536 MiB'")"
}

# 参数：TIER标识  磁盘层环境变量  iostat设备(空=无盘/重算)
run_tier(){
  TIER=$1; DISKENV=$2; IODEV=$3
  say "===== TIER $TIER start ====="
  restart
  docker exec vllm bash -lc "rm -rf /mnt/ws5000/lmcache; mkdir -p /mnt/ws5000/lmcache; rm -rf /root/models/lmcache_local; mkdir -p /root/models/lmcache_local"
  docker exec -d vllm bash -lc "export PYTHONHASHSEED=0 MACA_GRAPH_LAUNCH_MODE=1 LMCACHE_LOG_LEVEL=INFO LMCACHE_CHUNK_SIZE=256 LMCACHE_LOCAL_CPU=True LMCACHE_MAX_LOCAL_CPU_SIZE=8 $DISKENV; vllm serve /root/models/Qwen2.5-7B-Instruct --dtype bfloat16 --max-model-len 32768 --gpu-memory-utilization 0.9 --enable-prefix-caching --kv-transfer-config '{\"kv_connector\":\"LMCacheConnectorV1\",\"kv_role\":\"kv_both\"}' --port 8000 > /root/models/vllm_k26${TIER}.log 2>&1"
  wait_ready || return 1
  say "populate 100 sessions..."
  docker exec vllm bash -lc "python /root/benchcap_full.py k26${TIER}_pp 500 100 populate 1 1"
  say "disk: ws5000=$(docker exec vllm bash -lc "du -sh /mnt/ws5000/lmcache|cut -f1") local=$(docker exec vllm bash -lc "du -sh /root/models/lmcache_local|cut -f1")"
  MARK=$(docker exec vllm bash -lc "wc -l < /root/models/vllm_k26${TIER}.log")
  say "drop_caches..."; sync; echo 3 > /proc/sys/vm/drop_caches; say "free: $(free -g|sed -n '2p')"
  IOP=""
  if [ -n "$IODEV" ]; then nohup bash -c "iostat -x 2 240 $IODEV > /tmp/iostat_k26${TIER}.log 2>&1" >/dev/null 2>&1 & IOP=$!; fi
  say "measure sessions 0-63 (outside GPU-resident) conc16 decode512..."
  docker exec vllm bash -lc "python /root/benchcap_full.py k26${TIER} 500 64 measure 512 16"
  [ -n "$IOP" ] && kill $IOP 2>/dev/null
  NL=$(docker exec vllm bash -lc "tail -n +$MARK /root/models/vllm_k26${TIER}.log | grep -aE 'need to load:' | grep -av 'need to load: 0' | wc -l")
  ZL=$(docker exec vllm bash -lc "tail -n +$MARK /root/models/vllm_k26${TIER}.log | grep -acE 'need to load: 0'")
  say "TIER $TIER need-to-load>0=$NL (期望64=全物理); =0(GPU/重算)=$ZL"
  if [ -n "$IODEV" ]; then D=$(basename $IODEV); say "TIER $TIER $D peak rkB/s: $(awk -v d=$D '$1==d{print $3}' /tmp/iostat_k26${TIER}.log|sort -n|tail -3|tr '\n' ' ')"; fi
  say "TIER $TIER json: $(docker exec vllm bash -lc "cat /mnt/ws5000/results/k26${TIER}.json|tr '\n' ' '")"
  say "===== TIER $TIER done ====="
}

run_tier D "LMCACHE_LOCAL_DISK='file:///mnt/ws5000/lmcache' LMCACHE_MAX_LOCAL_DISK_SIZE=300" /dev/md0
run_tier E "LMCACHE_LOCAL_DISK='file:///root/models/lmcache_local' LMCACHE_MAX_LOCAL_DISK_SIZE=300" /dev/nvme0n1
run_tier A "" ""
say "########## ALL THREE DONE ##########"
```

## 4. GPU 命中档（①，单独跑）

小 M、不清缓存，验证 need-to-load=0：

```bash
docker exec vllm bash -lc "python /root/benchcap_full.py k26G_pp 500 20 populate 1 1"
docker exec vllm bash -lc "python /root/benchcap_full.py k26G    500 20 measure 512 16"
docker exec vllm bash -lc "grep 'need to load:' /root/models/vllm_k26G.log | grep -v 'need to load: 0' | wc -l"  # 应=0
```

---

## 5. 实测结果

### 5.1 26K 物理读三档（最严谨）

口径：populate 100 会话 → measure 0–63（GPU 驻留 71–99 之外）+ 清页缓存，全部物理盘命中。

| 指标 | ① GPU 命中(M=20) | ② 远端存储(物理) | ②′ 本地NVMe(物理) | ③ 重算 |
|---|---|---|---|---|
| KV 来源 | GPU 显存 | 远端阵列物理盘 | 本地物理盘 | 重算 |
| TTFT p50 | 0.540 s | 1.368 s | 1.572 s | 20.972 s |
| TTFT p90 | 0.824 s | 16.069 s | 16.866 s | 57.823 s |
| TTFT p99 | 0.825 s | 19.633 s | 21.136 s | 84.551 s |
| TTFT 均值 | 0.489 s | 5.111 s | 5.551 s | 25.768 s |
| TPOT p50 | 48.0 ms | 126.3 ms | 132.2 ms | 349.8 ms |
| 请求吞吐 | 1.13 req/s | 0.54 req/s | 0.47 req/s | 0.18 req/s |
| 输出吞吐 | 234.6 tok/s | 106.7 tok/s | 100.7 tok/s | 34.7 tok/s |
| 命中验证 | need-to-load=0 | 64/64 全物理 | 64/64 全物理 | 0 盘读(重算) |
| 物理读峰值 | — | md0 1.31 GB/s | nvme0n1 1.24 GB/s | — |

**结论**：存储 vs 重算 TTFT 快 15.3×、输出吞吐 3.1×；远端阵列 vs 本地盘（均物理读）TTFT p50 快 13%、吞吐高 6%、带宽高 6%。

### 5.2 8K 物理读三档

| 指标 | ① GPU 命中(M=64) | ② 远端存储(M=160) | ②′ 本地NVMe(M=160) | ③ 重算(M=160) |
|---|---|---|---|---|
| TTFT p50 | 0.089 s | 0.437 s | 0.512 s | 1.268 s |
| TTFT p99 | 0.321 s | 5.450 s | 7.308 s | 17.740 s |
| TPOT p50 | 29.9 ms | 53.1 ms | 57.9 ms | 107.5 ms |
| 输出吞吐 | 466 tok/s | 277 tok/s | 248 tok/s | 137 tok/s |
| need-to-load | 0(纯显存) | 160(全从盘) | 160(全从盘) | 0(无盘) |
| 物理读峰值 | — | 1.43 GB/s | 1.04 GB/s | — |

**结论**：存储 vs 重算 TTFT 快 2.9×、吞吐翻倍。8K 约 2.9×，26K 拉大到约 15×——输入越长，存储价值越大。

### 5.3 并发拐点（物理读，SLO p90 TTFT ≤ 2s）

| 并发 | TTFT p99 | 达标(≤2s) |
|---|---|---|
| 4 | 1.671 s | 是 |
| 6 | 2.556 s | 否 |

物理读真实并发上限 ≈ 4–5；瓶颈是单链路读带宽 vs 并发突发需求。

### 5.4 绝对内存墙

工作集 262.5 GB ＞ 251 GB 物理内存（M=640×8K），任何 RAM 都装不下：远端存储清页缓存物理回读 100% 恢复、p50 0.423s、1.18 GB/s。证明存储容量价值不可被 RAM 替代。

### 5.5 带宽诊断

LMCache 单请求 retrieve 吞吐 1.16–1.43 GB/s（与输入大小无关），瓶颈在 LMCache 读管线（无 GDS + 文件分块），非存储本身（fio 裸盘单盘 2.68 / 阵列 3 GB/s 有余量）。

### 5.6 原始数据清单

| 文件 | 内容 |
|---|---|
| `/mnt/ws5000/results/k26{D,E,A,G}.json` | 26K 四档指标 |
| `/root/models/vllm_k26{D,E,A}.log` | 服务日志（含 need-to-load 原文） |
| `/tmp/iostat_k26{D,E}.log` | 物理读时间序列 |
| `/root/run_tiers.out` | 编排日志 |
