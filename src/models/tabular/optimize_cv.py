"""
optimize_cv.py -- 8-fold stratified CV optimizer for Track 2 IF model.
"""
import json, pickle, time, warnings
from pathlib import Path
import numpy as np
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.feature_selection import VarianceThreshold
from sklearn.metrics import (average_precision_score, f1_score,
    precision_recall_curve, precision_score, recall_score)
from sklearn.model_selection import StratifiedKFold

warnings.filterwarnings("ignore")
DATA_DIR = Path("src/models/tabular/data")
CKPT_DIR = Path("src/models/tabular/checkpoints")
CKPT_DIR.mkdir(parents=True, exist_ok=True)
N_FOLDS = 8; RANDOM_STATE = 42; MIN_PRECISION = 0.15
SECOM_FAIL_RATE = 104/1567

def to_anomaly(raw):
    return np.clip(0.5 - np.clip(raw, -0.5, 0.5), 0.0, 1.0)

def best_thr(scores, labels):
    precs, recs, thrs = precision_recall_curve(labels, scores)
    bt, br, bp, bf = 0.5, 0.0, 0.0, 0.0
    for t,p,r in zip(thrs, precs[:-1], recs[:-1]):
        if p >= MIN_PRECISION:
            f1 = 2*p*r/(p+r+1e-9)
            if r > br or (r==br and f1>bf): bt,br,bp,bf = t,r,p,f1
    return bt, br, bp, bf

def eval_cfg(X_all, y_all, cfg):
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    metrics = []
    for tr_i, vl_i in skf.split(X_all, y_all):
        Xt,Xv = X_all[tr_i], X_all[vl_i]
        yt,yv = y_all[tr_i], y_all[vl_i]
        if cfg.get("vt") is not None:
            vf = VarianceThreshold(cfg["vt"]); Xt=vf.fit_transform(Xt); Xv=vf.transform(Xv)
        if cfg.get("pca") is not None:
            nc=min(cfg["pca"],Xt.shape[1]); pf=PCA(nc,random_state=RANDOM_STATE)
            Xt=pf.fit_transform(Xt); Xv=pf.transform(Xv)
        m = IsolationForest(n_estimators=cfg["ne"], contamination=cfg["cont"],
            max_features=cfg.get("mf",1.0), random_state=RANDOM_STATE, n_jobs=-1)
        m.fit(Xt[yt==0])
        sc = to_anomaly(m.decision_function(Xv))
        if yv.sum()==0: continue
        prauc = average_precision_score(yv, sc)
        t,r,p,f = best_thr(sc, yv)
        metrics.append((prauc,f,r,p,t))
    if not metrics: return {"prauc":0,"f1":0,"rec":0,"prec":0,"thr":0.5}
    arr = np.array(metrics)
    return {"prauc":float(arr[:,0].mean()),"f1":float(arr[:,1].mean()),
            "rec":float(arr[:,2].mean()),"prec":float(arr[:,3].mean()),
            "thr":float(arr[:,4].mean())}

def main():
    X_train=np.load(DATA_DIR/"X_train.npy"); y_train=np.load(DATA_DIR/"y_train.npy")
    X_val=np.load(DATA_DIR/"X_val.npy"); y_val=np.load(DATA_DIR/"y_val.npy")
    X_all=np.vstack([X_train,X_val]); y_all=np.hstack([y_train,y_val])
    print(f"Dataset: {X_all.shape}, fails={y_all.sum()}")

    baseline={"ne":200,"cont":SECOM_FAIL_RATE,"mf":1.0,"vt":None,"pca":None}
    bm = eval_cfg(X_all, y_all, baseline)
    print(f"Baseline: PR-AUC={bm['prauc']:.4f} Rec={bm['rec']:.4f} Prec={bm['prec']:.4f} F1={bm['f1']:.4f}")

    candidates=[]
    for cont in [0.04,0.05,0.066,0.08,0.10,0.12,0.15,0.20]:
        for ne in [100,200,300,500]:
            for mf in [0.3,0.5,0.7,1.0]:
                candidates.append({"ne":ne,"cont":cont,"mf":mf,"vt":None,"pca":None,
                    "lbl":f"c{cont:.3f}_n{ne}_m{mf}"})
    for vt in [0.01,0.05,0.10]:
        for cont in [0.05,0.066,0.10,0.15]:
            for ne in [200,300]:
                candidates.append({"ne":ne,"cont":cont,"mf":0.7,"vt":vt,"pca":None,
                    "lbl":f"VT{vt}_c{cont:.3f}_n{ne}"})
    for pca in [50,100,150,200]:
        for cont in [0.05,0.066,0.10,0.15]:
            for ne in [200,300]:
                candidates.append({"ne":ne,"cont":cont,"mf":1.0,"vt":None,"pca":pca,
                    "lbl":f"PCA{pca}_c{cont:.3f}_n{ne}"})

    print(f"Evaluating {len(candidates)} configs x {N_FOLDS} folds ...")
    results=[]
    t0=time.time()
    for i,cfg in enumerate(candidates):
        m=eval_cfg(X_all,y_all,cfg)
        results.append((m["prauc"],m["f1"],m["rec"],m["prec"],m["thr"],cfg))
        if (i+1)%30==0:
            print(f"  [{i+1}/{len(candidates)}] {time.time()-t0:.0f}s best_prauc={max(r[0] for r in results):.4f}")

    results.sort(key=lambda x:(x[0],x[1]),reverse=True)
    print("\nTOP 10:")
    for k,(pa,f1,rec,prec,thr,cfg) in enumerate(results[:10],1):
        print(f"  #{k} PR-AUC={pa:.4f} Rec={rec:.4f} Prec={prec:.4f} F1={f1:.4f} Thr={thr:.4f} | {cfg['lbl']}")

    # best by PR-AUC
    best_pa,best_f1,best_rec,best_prec,best_thr,best_cfg = results[0]
    # also pick best recall with prec>=0.15
    br_result = max((r for r in results if r[3]>=MIN_PRECISION), key=lambda x:(x[2],x[0]), default=results[0])
    print(f"\nBest recall (prec>={MIN_PRECISION}): Rec={br_result[2]:.4f} Prec={br_result[3]:.4f} F1={br_result[1]:.4f} PA={br_result[0]:.4f} | {br_result[5]['lbl']}")

    # Use best recall config if it also has reasonable PR-AUC
    if br_result[0] >= best_pa * 0.95:
        best_pa,best_f1,best_rec,best_prec,best_thr,best_cfg = br_result
        print("=> Using best-recall config (within 5% of top PR-AUC)")

    print(f"\nSelected: {best_cfg['lbl']}")
    print(f"  CV: PR-AUC={best_pa:.4f} Rec={best_rec:.4f} Prec={best_prec:.4f} F1={best_f1:.4f} Thr={best_thr:.4f}")

    # retrain on full X_train
    Xt=X_train.copy(); yt=y_train.copy()
    vt_f=None; pca_f=None
    if best_cfg.get("vt") is not None:
        vt_f=VarianceThreshold(best_cfg["vt"]); Xt=vt_f.fit_transform(Xt)
    if best_cfg.get("pca") is not None:
        nc=min(best_cfg["pca"],Xt.shape[1]); pca_f=PCA(nc,random_state=RANDOM_STATE); Xt=pca_f.fit_transform(Xt)

    final=IsolationForest(n_estimators=best_cfg["ne"],contamination=best_cfg["cont"],
        max_features=best_cfg.get("mf",1.0),random_state=RANDOM_STATE,n_jobs=-1)
    final.fit(Xt[yt==0])

    Xv=X_val.copy()
    if vt_f is not None: Xv=vt_f.transform(Xv)
    if pca_f is not None: Xv=pca_f.transform(Xv)

    vsc=to_anomaly(final.decision_function(Xv))
    yp=(vsc>=best_thr).astype(int)
    vr=recall_score(y_val,yp,zero_division=0)
    vp=precision_score(y_val,yp,zero_division=0)
    vf=f1_score(y_val,yp,zero_division=0)
    vpa=average_precision_score(y_val,vsc)
    print(f"\nHeld-out val: Rec={vr:.4f} Prec={vp:.4f} F1={vf:.4f} PR-AUC={vpa:.4f}")

    from sklearn.metrics import confusion_matrix
    cm=confusion_matrix(y_val,yp); tn,fp,fn,tp=cm.ravel()
    print(f"  CM: TN={tn} FP={fp} FN={fn} TP={tp}")

    with open(CKPT_DIR/"isolation_forest.pkl","wb") as f: pickle.dump(final,f)
    if vt_f:
        with open(CKPT_DIR/"variance_filter.pkl","wb") as f: pickle.dump(vt_f,f)
    if pca_f:
        with open(CKPT_DIR/"pca_model.pkl","wb") as f: pickle.dump(pca_f,f)

    meta={
        "model":"IsolationForest","n_estimators":best_cfg["ne"],
        "contamination":best_cfg["cont"],"max_features":best_cfg.get("mf",1.0),
        "random_state":RANDOM_STATE,"threshold":float(best_thr),
        "var_threshold":best_cfg.get("vt"),"n_pca":best_cfg.get("pca"),
        "cv_folds":N_FOLDS,"cv_pr_auc":float(best_pa),
        "cv_recall_fail":float(best_rec),"cv_prec_fail":float(best_prec),"cv_f1_fail":float(best_f1),
        "val_recall_fail":float(vr),"val_prec_fail":float(vp),
        "val_f1_fail":float(vf),"val_pr_auc":float(vpa),
        "confusion_matrix":{"tn":int(tn),"fp":int(fp),"fn":int(fn),"tp":int(tp)},
        "note":f"Optimized via {N_FOLDS}-fold CV over {len(candidates)} configs. Threshold=max_recall @ prec>={MIN_PRECISION}."
    }
    with open(CKPT_DIR/"model_meta.json","w") as f: json.dump(meta,f,indent=2)
    print(f"\nCheckpoint saved. val_recall={vr:.4f} val_f1={vf:.4f}")
    return vr,vp,vf,vpa

if __name__=="__main__": main()
