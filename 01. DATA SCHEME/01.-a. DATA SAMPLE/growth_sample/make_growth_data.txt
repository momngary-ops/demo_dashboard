import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# 1. 초기 설정 (30일치 데이터)
start_date = datetime(2026, 2, 16)
days = 30
data = []

# --- 초기 생육 상태 세팅 ---
chojang = 22.0          # 068. 초장 (정수 0~35, 소수 0~9 규칙 반영)
julggi = 11.50          # 069. 줄기굵기 (mm)
num_leaves = 9          # 070. 엽수 (시작 시 9장)
height_flower = 20.0    # 071. 화방높이 (.0 or .5)
num_flower_int = 5      # 072. 화방수 정수부
num_flower_dec = 0      # 072. 화방수 소수부 인덱스 (0: .0, 1: .33, 2: .66, 3: .99)
speed_flower = 0.85     # 073. 화방전개속도 (개/주)
fruit_loaded_int = 3    # 074. 착과군 정수부
fruit_loaded_dec = 1    # 074. 착과군 소수부 인덱스
num_fruit = 18          # 075. 착과수 (달려있는 총 열매 수)
speed_fruit = 0.80      # 076. 착과속도
harvest_grp = 1         # 077. 수확군
coloring_grp = 2        # 078. 착색군 (수확군보다 보통 1단 높음)

dec_values = [0.0, 0.33, 0.66, 0.99] # 명세서 소수부 피커 규칙

for i in range(days):
    current_date = start_date + timedelta(days=i)
    date_str = current_date.strftime('%Y-%m-%d')
    
    # 1. 초장 & 줄기굵기 (지속 생장)
    chojang += np.random.uniform(0.1, 0.3)
    if chojang > 35.0: chojang = 35.0 # 최대 35
    
    julggi = max(10.0, min(15.0, julggi + np.random.uniform(-0.05, 0.1)))
    
    # 2. 엽수 및 적엽(De-leafing) 로직
    if i % 3 == 0 and i != 0: 
        num_leaves += 1 # 3일에 1장씩 새 잎 발생
        
    if num_leaves > 14:
        # 잎이 무성해지면 하엽제거(적엽) 진행하여 5장 내외로 남김
        num_leaves = np.random.randint(4, 6)
        
    # 3. 화방높이 (.0 또는 .5 단위)
    height_flower += np.random.uniform(0.1, 0.4)
    height_flower_val = round(height_flower * 2) / 2 # 가장 가까운 0.5 단위로 반올림
    
    # 4. 화방수 & 착과군 (.33, .66, .99 전개 규칙)
    if i % 2 == 0: # 2일에 1스텝(0.33)씩 화방 전개
        num_flower_dec += 1
        if num_flower_dec > 3:
            num_flower_dec = 0
            num_flower_int += 1
            
    if i % 3 == 0: # 3일에 1스텝(0.33)씩 착과 전개
        fruit_loaded_dec += 1
        if fruit_loaded_dec > 3:
            fruit_loaded_dec = 0
            fruit_loaded_int += 1
            
    num_flower_val = num_flower_int + dec_values[num_flower_dec]
    fruit_loaded_val = fruit_loaded_int + dec_values[fruit_loaded_dec]
    
    # 5. 착과수 증감 및 수확 로직
    # 꽃이 피고 착과가 되며 열매 수 증가
    if i % 2 == 0: num_fruit += np.random.randint(1, 3)
    
    # 일주일(7일) 주기로 수확/착색단수 증가 및 착과수 감소
    if i % 7 == 0 and i != 0:
        harvest_grp += 1
        coloring_grp += 1
        harvested_count = np.random.randint(4, 8) # 한번에 4~8개 수확
        num_fruit = max(0, num_fruit - harvested_count)
    
    # 속도 지표 미세 변동
    speed_flower = max(0.5, speed_flower + np.random.uniform(-0.02, 0.02))
    speed_fruit = max(0.5, speed_fruit + np.random.uniform(-0.02, 0.02))

    # 행 데이터 조립
    row = {
        'xdatetime': date_str,
        '068_chojang': round(chojang, 1),
        '069_julggi': round(julggi, 2),
        '070_num_leaves': num_leaves,
        '071_height_flower': height_flower_val,
        '072_num_flower': round(num_flower_val, 2),
        '073_speed_flower': round(speed_flower, 2),
        '074_fruit_loaded': round(fruit_loaded_val, 2),
        '075_num_fruit': num_fruit,
        '076_speed_fruit': round(speed_fruit, 2),
        '077_harvest_grp': harvest_grp,
        '078_coloring_grp': coloring_grp
    }
    data.append(row)

# DataFrame 변환 및 CSV 저장
df = pd.DataFrame(data)
df.to_csv('mock_growth_data.csv', index=False, encoding='utf-8-sig')
print("✅ 30일치 생육(GROWTH) 데이터 MOCK 생성이 성공적으로 완료되었습니다.")