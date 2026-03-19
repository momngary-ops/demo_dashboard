import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import math

# 1. 초기 설정 및 기준값
start_time = datetime(2026, 3, 17, 0, 0, 0)
minutes_in_day = 1440
data = []

# 상태 변수 초기화
water_con = 65.0       # 함수율 초기값
sunadd = 0.0           # 누적일사량
xinsunadd = 0.0        # 내부누적일사량
ac_val1 = 0.0          # 양액 누적량
j30m = 0.0             # 30분간 누적일사량 (관수용)

# 고정 설정값 (대시보드에서 변경 가능한 값들)
xco2set = 450          # CO2 설정값 (023)
xventtemp1 = 26.0      # 환기온도 (040)
xheattemp1 = 18.0      # 난방온도 (041)
set_ec = 2.5           # 설정EC (050)
set_ph = 5.8           # 설정PH (052)
set_val1 = 150.0       # 양액 설정량 (047)
re_val1 = 1000.0       # 양액 잔여량 (048, 하루동안 줄어듦)
sunrise_time = "06:30" # 일출시간 (054)
sunset_time = "18:30"  # 일몰시간 (055)

for i in range(minutes_in_day):
    current_time = start_time + timedelta(minutes=i)
    time_str = current_time.strftime('%Y-%m-%d %H:%M:%S')
    hour = current_time.hour
    minute = current_time.minute
    
    # --- 1. 시간 및 기본 상태 ---
    xjuya = 1 if (hour > 6 or (hour == 6 and minute >= 30)) and (hour < 18 or (hour == 18 and minute < 30)) else 0
    
    # --- 2. 외부 기상 데이터 ---
    time_rad = ((i - 300) / minutes_in_day) * 2 * math.pi
    xouttemp = 17.5 + 7.5 * math.sin(time_rad) + np.random.normal(0, 0.2)
    xwinddirec = np.random.randint(0, 360)
    xwindsp = abs(math.sin(time_rad * 2) * 5 + np.random.normal(0, 1))
    xgndtemp = xouttemp - 2.0 + np.random.normal(0, 0.1)
    xgndhum = max(40, 90 - (xouttemp * 1.2)) + np.random.normal(0, 1)
    xrain = 0

    if xjuya == 1:
        sun_rad = ((i - 390) / 720) * math.pi
        xsunvol = max(0, 800 * math.sin(sun_rad) + np.random.normal(0, 20))
        xinsunvol = xsunvol * 0.7
    else:
        xsunvol = 0.0
        xinsunvol = 0.0
        
    sunvol = xsunvol
    
    sunadd += (xsunvol * 60) / 10000
    xinsunadd += (xinsunvol * 60) / 10000
    j30m = (xsunvol * 60 * 30) / 10000 if xjuya else 0.0

    # --- 3. 내부 환경 데이터 ---
    xintemp1 = xouttemp + (xinsunvol * 0.01) + np.random.normal(0, 0.2)
    if xintemp1 < xheattemp1:
        xintemp1 = xheattemp1 + np.random.normal(0, 0.2)
    elif xintemp1 > xventtemp1:
        xintemp1 = xventtemp1 - np.random.normal(0, 0.2)
    
    in_temp = xintemp1
    
    xinhum1 = max(40, min(95, 100 - (xintemp1 * 1.5) + np.random.normal(0, 1)))
    in_hum = xinhum1
    
    xco2 = xco2set + np.random.normal(0, 15)
    xsthum = 20.0 + (xintemp1 * 0.5)
    xabhum = xsthum * (xinhum1 / 100)
    xhumlack = xsthum - xabhum
    xdhum = xintemp1 - ((100 - xinhum1) / 5)

    # --- 4. 양액 데이터 ---
    if (hour == 8 and minute == 0) or (hour == 13 and minute == 0):
        water_con = 80.0
        ac_val1 += set_val1
        re_val1 -= set_val1
        g1 = sunadd
    else:
        water_con = max(45.0, water_con - 0.05 + np.random.normal(0, 0.01))
        g1 = 0.0

    now_ec = set_ec + np.random.normal(0, 0.05)
    now_ph = set_ph + np.random.normal(0, 0.05)
    medium_ec = now_ec + 0.5
    medium_temp = xintemp1 - 2.0
    pi_ec = now_ec - 0.1

    # --- 5. 구동기 상태 및 개도 데이터 ---
    xborun = 1 if xintemp1 <= xheattemp1 + 0.5 else 0
    xco2run = 1 if xco2 < xco2set else 0
    
    if xintemp1 > xventtemp1 - 1:
        xwinvol1_1 = min(100, (xintemp1 - xventtemp1 + 1) * 20)
    else:
        xwinvol1_1 = 0.0
    xcurivol = 100 if xjuya == 0 else 0

    xwatertemp2 = 45.0 if xborun else 25.0
    Xsupplytemp1 = 60.0 if xborun else 25.0
    Xreturntemp1 = 40.0 if xborun else 22.0
    x3way1vol = 100 if xborun else 0

    row = {
        'xdatetime_srv': time_str,
        'xdatetime_loc': time_str,
        'xouttemp': round(xouttemp, 1),
        'xwinddirec': xwinddirec,
        'xwindsp': round(xwindsp, 1),
        'xsunvol': round(xsunvol, 1),
        'xsunadd': round(sunadd, 2),
        'xinsunvol': round(xinsunvol, 1),
        'xinsunadd': round(xinsunadd, 2),
        'xgndtemp': round(xgndtemp, 1),
        'xgndhum': round(xgndhum, 1),
        'xwatertemp2': round(xwatertemp2, 1),
        'xrain': xrain,
        'xhumlack': round(xhumlack, 2),
        'xsthum': round(xsthum, 2),
        'xabhum': round(xabhum, 2),
        'xdhum': round(xdhum, 1),
        'Xsupplytemp1': round(Xsupplytemp1, 1),
        'Xreturntemp1': round(Xreturntemp1, 1),
        'xintemp1': round(xintemp1, 1),
        'xinhum1': round(xinhum1, 1),
        'xco2': int(xco2),
        'xco2set': xco2set,
        'xwinvol1_1': round(xwinvol1_1, 1),
        'xcurivol': xcurivol,
        'x3way1vol': x3way1vol,
        'xwinlauto': '자동', 'xcurlauto': '자동', 'x3waylauto': '자동', 'xco2auto': '자동',
        'xlightauto': '자동', 'xhunauto': '자동', 'xboauto': '자동', 'xpumpauto': '자동',
        'xco2run': xco2run,
        'xlightrun': 0,
        'xhunrun': 0,
        'xborun': xborun,
        'xjuya': xjuya,
        'xventtemp1': xventtemp1,
        'xheattemp1': xheattemp1,
        'xasslauto': '자동',
        'xass1run': 0,
        'XheatandCool1Auto': '자동',
        'XheatandCool1Run': 0,
        'xpumprun1': 1 if xborun else 0,
        'set_val1': set_val1,
        're_val1': re_val1,
        'ac_val1': ac_val1,
        'set_ec': set_ec,
        'now_ec': round(now_ec, 2),
        'set_ph': set_ph,
        'now_ph': round(now_ph, 2),
        'sunrise': sunrise_time,
        'sunset': sunset_time,
        'sunvol': round(sunvol, 1),
        'sunadd': round(sunadd, 2),
        'water_con': round(water_con, 1),
        'medium_ec': round(medium_ec, 2),
        'medium_temp': round(medium_temp, 1),
        'in_temp': round(in_temp, 1),
        'in_hum': round(in_hum, 1),
        'pi_ec': round(pi_ec, 2),
        'g1': round(g1, 2),
        'j30m': round(j30m, 2),
        'jday': 1850.5
    }
    data.append(row)

df = pd.DataFrame(data)
df.to_csv('mock_climate_all_data.csv', index=False, encoding='utf-8-sig')
print("✅ 총 1440행(24시간), 67개 항목의 전체 MOCK 데이터가 성공적으로 생성되었습니다.")
