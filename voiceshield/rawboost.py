#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RawBoost -- channel and noise augmentation for raw-waveform anti-spoofing.

Vendored verbatim from github.com/TakHemlata/RawBoost-antispoofing (MIT), by the
same authors as the ASVspoof RawNet2 baseline this detector is built on. Only this
docstring and the `process` dispatcher at the bottom are ours; the DSP below is
unmodified so its published behaviour carries over.

WHY THIS, FOR THIS PROBLEM
--------------------------
v0 reaches 1.74 % EER on its own corpus and chance on an independent one. The 2x2
isolation put the failure on the bonafide side, and a causal probe located it
precisely: adding nothing but broadband noise to GENUINE internal speech drives the
flagged-as-spoof rate from 1.3 % (noise floor -62.8 dB) to 76.7 % (-37.1 dB). The
external corpus sits at -43.2 dB and is flagged 76.2 %.

The training corpus has one bonafide source and it is studio-clean, so the model
learned "clean recording = genuine" and reads ordinary recording noise as synthesis.

RawBoost models exactly that nuisance variability -- encoding, transmission,
microphones, amplifiers, linear and non-linear distortion -- and needs no external
noise recordings or impulse responses, which also makes it the only intervention here
that costs no download. Published gain on this same RawNet2 baseline: 27 % relative
on ASVspoof 2021 LA.

It changes nothing about the architecture. It is applied to the waveform in the
training Dataset only; dev and test paths never see it.

Algorithms (`--rawboost`):
    0  off
    1  LnL convolutive noise      -- microphone / amplifier / channel
    2  ISD additive noise         -- impulsive, signal-dependent
    3  SSI additive noise         -- stationary coloured, signal-independent
    4  1+2+3 in series
    5  1+2 in series
    6  1+3 in series
    7  2+3 in series
    8  1||2 in parallel
"""

import numpy as np
from scipy import signal
import copy


def randRange(x1, x2, integer):
    y = np.random.uniform(low=x1, high=x2, size=(1,))
    if integer:
        y = int(y)
    return y

def normWav(x,always):
    if always:
        x = x/np.amax(abs(x))
    elif np.amax(abs(x)) > 1:
            x = x/np.amax(abs(x))
    return x



def genNotchCoeffs(nBands,minF,maxF,minBW,maxBW,minCoeff,maxCoeff,minG,maxG,fs):
    b = 1
    for i in range(0, nBands):
        fc = randRange(minF,maxF,0);
        bw = randRange(minBW,maxBW,0);
        c = randRange(minCoeff,maxCoeff,1);
          
        if c/2 == int(c/2):
            c = c + 1
        f1 = fc - bw/2
        f2 = fc + bw/2
        if f1 <= 0:
            f1 = 1/1000
        if f2 >= fs/2:
            f2 =  fs/2-1/1000
        b = np.convolve(signal.firwin(c, [float(f1), float(f2)], window='hamming', fs=fs),b)

    G = randRange(minG,maxG,0); 
    _, h = signal.freqz(b, 1, fs=fs)    
    b = pow(10, G/20)*b/np.amax(abs(h))   
    return b


def filterFIR(x,b):
    N = b.shape[0] + 1
    xpad = np.pad(x, (0, N), 'constant')
    y = signal.lfilter(b, 1, xpad)
    y = y[int(N/2):int(y.shape[0]-N/2)]
    return y

# Linear and non-linear convolutive noise
def LnL_convolutive_noise(x,N_f,nBands,minF,maxF,minBW,maxBW,minCoeff,maxCoeff,minG,maxG,minBiasLinNonLin,maxBiasLinNonLin,fs):
    y = [0] * x.shape[0]
    for i in range(0, N_f):
        if i == 1:
            minG = minG-minBiasLinNonLin;
            maxG = maxG-maxBiasLinNonLin;
        b = genNotchCoeffs(nBands,minF,maxF,minBW,maxBW,minCoeff,maxCoeff,minG,maxG,fs)
        y = y + filterFIR(np.power(x, (i+1)),  b)     
    y = y - np.mean(y)
    y = normWav(y,0)
    return y


# Impulsive signal dependent noise
def ISD_additive_noise(x, P, g_sd):
    beta = randRange(0, P, 0)
    
    y = copy.deepcopy(x)
    x_len = x.shape[0]
    n = int(x_len*(beta/100))
    p = np.random.permutation(x_len)[:n]
    f_r= np.multiply(((2*np.random.rand(p.shape[0]))-1),((2*np.random.rand(p.shape[0]))-1))
    r = g_sd * x[p] * f_r
    y[p] = x[p] + r
    y = normWav(y,0)
    return y


# Stationary signal independent noise

def SSI_additive_noise(x,SNRmin,SNRmax,nBands,minF,maxF,minBW,maxBW,minCoeff,maxCoeff,minG,maxG,fs):
    noise = np.random.normal(0, 1, x.shape[0])
    b = genNotchCoeffs(nBands,minF,maxF,minBW,maxBW,minCoeff,maxCoeff,minG,maxG,fs)
    noise = filterFIR(noise, b)
    noise = normWav(noise,1)
    SNR = randRange(SNRmin, SNRmax, 0)
    noise = noise / np.linalg.norm(noise,2) * np.linalg.norm(x,2) / 10.0**(0.05 * SNR)
    x = x + noise
    return x







# --- our dispatcher ------------------------------------------------------
class RawBoostArgs:
    """Default parameters, taken from the reference implementation's argparse."""
    # LnL_convolutive_noise
    N_f = 5
    nBands = 5
    minF, maxF = 20, 8000
    minBW, maxBW = 100, 1000
    minCoeff, maxCoeff = 10, 100
    minG, maxG = 0, 0
    minBiasLinNonLin, maxBiasLinNonLin = 5, 20
    # ISD_additive_noise
    P = 10
    g_sd = 2
    # SSI_additive_noise
    SNRmin, SNRmax = 10, 40


def process(x, sr, algo, args=None):
    """Apply one RawBoost algorithm to a waveform. algo=0 returns it untouched.

    maxF is clamped below the Nyquist frequency: the reference default of 8000 Hz is
    exactly sr/2 at 16 kHz, and a notch centred at Nyquist is degenerate.
    """
    if not algo:
        return x
    a = args or RawBoostArgs()
    maxF = min(a.maxF, sr // 2 - 1)

    def lnl(v):
        return LnL_convolutive_noise(v, a.N_f, a.nBands, a.minF, maxF, a.minBW, a.maxBW,
                                     a.minCoeff, a.maxCoeff, a.minG, a.maxG,
                                     a.minBiasLinNonLin, a.maxBiasLinNonLin, sr)

    def isd(v):
        return ISD_additive_noise(v, a.P, a.g_sd)

    def ssi(v):
        return SSI_additive_noise(v, a.SNRmin, a.SNRmax, a.nBands, a.minF, maxF,
                                  a.minBW, a.maxBW, a.minCoeff, a.maxCoeff,
                                  a.minG, a.maxG, sr)

    if algo == 1:   return lnl(x)
    if algo == 2:   return isd(x)
    if algo == 3:   return ssi(x)
    if algo == 4:   return ssi(isd(lnl(x)))
    if algo == 5:   return isd(lnl(x))
    if algo == 6:   return ssi(lnl(x))
    if algo == 7:   return ssi(isd(x))
    if algo == 8:
        return normWav(lnl(x) + isd(x), 0)
    raise ValueError(f"unknown RawBoost algo {algo}")
