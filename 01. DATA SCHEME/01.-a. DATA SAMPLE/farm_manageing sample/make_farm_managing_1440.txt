import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# 1. 초기 설정
start_time = datetime(2026, 3, 13, 0, 0, 0)
minutes_in_day = 1440
data = []

# --- 초기 기준 변수 세팅 ---
target_revenue = 6000000          # 100. 일일 목표 매출액 600만원
monthly_sales_base = 45000000     # 102. 전일까지 당월 누적 매출 4500만원
accounts_receivable = 12000000    # 103. 미수금 현황
maintenance_cost = 500000         # 104. 예상 유지관리비
power_cost_base = 150000          # 105. 전력 요금 누적 (기본 15만원에서 시작)

target_production = 1500.0        # 106. 목표 생산량 (1,500kg)
daily_production = 0.0            # 107. 일일생산량 누적 시작점
avg_daily_yield = 1000.0          # 108. 최근 평균 생산량
special_grade_ratio = 15.0        # 109. 특품 비율 (PPT 반영: 소과 위주로 인해 낮음)
defect_rate = 7.5                 # 110. 불량율 (%)

contract_id = "ORD-202603-013"    # 111. 계약 코드
vendor_id = "가락시장_A청과"        # 112. 판매처 ID
contract_crop_code = "완숙토마토"     # 113. 품목 코드
contract_req_grade = "일반"         # 114. 납품 요구 등급
contract_due_date = "2026-03-31"  # 115. 납품 마감일
contract_volume = 40.0            # 116. 거래처별 계약 물량 (ton)
fulfilled_volume_base = 12.0      # 117. 전일까지 납품 완료량 (ton)

shipment_id = "260313-001"        # 121. 출하 번호
market_price_kg = 3500            # 123. 당일 시장 도매가 (PPT 반영: 단가 하락)

stock_box = 5000.0                # 129. 포장재 재고량 (박스)
stock_nutrient = 2000.0           # 130. 양액/비료 재고량 (L)

for i in range(minutes_in_day):
    current_time = start_time + timedelta(minutes=i)
    time_str = current_time.strftime('%Y-%m-%d %H:%M:%S')
    hour = current_time.hour
    
    # 오전 8시 ~ 오후 5시까지 근무/수확 진행
    is_working_hour = 8 <= hour < 17
    
    if is_working_hour:
        # 분당 약 1.5 ~ 2.5 kg 수확 (9시간 누적 시 약 1,000~1,100kg 예상)
        harvest_per_min = np.random.uniform(1.5, 2.5)
        daily_production += harvest_per_min
        
        # 5kg당 포장재 1박스 차감
        stock_box -= (harvest_per_min / 5.0)
    
    # 생산물 중 재고 처리 로직 (17시에 일괄 출하한다고 가정)
    if hour < 17:
        produce_in_stock = daily_production / 1000.0 # 누적 수확량(ton)이 농장 창고 대기
        choolha = 0
        allocated_volume = 0
    else:
        produce_in_stock = 0.0 # 출하 완료로 0
        choolha = int(daily_production * market_price_kg) # 당일 출하액 확정
        allocated_volume = daily_production # 계약 매핑 수량으로 모두 전달
        
    # 재무 및 계약 지표 실시간 계산
    monthly_sales_total = monthly_sales_base + choolha
    fulfilled_volume = fulfilled_volume_base + (allocated_volume / 1000.0)
    fulfillment_rate = (fulfilled_volume / contract_volume) * 100
    
    # 전력 요금은 24시간 증가하되, 주간(히트펌프 등)에 더 크게 증가
    if 6 <= hour <= 18:
        power_cost_base += np.random.uniform(100, 200)
    else:
        power_cost_base += np.random.uniform(50, 100)
        
    # 양액 사용량 1분마다 미세 차감
    stock_nutrient -= np.random.uniform(0.1, 0.3)
    
    row = {
        'xdatetime': time_str,
        '100_target_revenue': target_revenue,
        '101_choolha': choolha,
        '102_monthly_sales_total': monthly_sales_total,
        '103_accounts_receivable': accounts_receivable,
        '104_expected_maintenance': maintenance_cost,
        '105_cost_electricity': int(power_cost_base),
        '106_target_production': target_production,
        '107_daily_shipment_kg': round(daily_production, 1),
        '108_avg_daily_yield': avg_daily_yield,
        '109_special_grade_ratio': special_grade_ratio,
        '110_defect_rate': defect_rate,
        '111_contract_id': contract_id,
        '112_vendor_id': vendor_id,
        '113_contract_crop_code': contract_crop_code,
        '114_contract_req_grade': contract_req_grade,
        '115_contract_due_date': contract_due_date,
        '116_contract_volume_ton': contract_volume,
        '117_fulfilled_volume_ton': round(fulfilled_volume, 2),
        '118_fulfillment_rate': round(fulfillment_rate, 1),
        '119_projected_yield_ton': round(contract_volume - fulfilled_volume + 1.5, 2),
        '120_delay_risk_status': "주의(소과 비중 높음)",
        '121_shipment_id': shipment_id,
        '122_allocated_volume_kg': round(allocated_volume, 1),
        '123_market_price_kg': market_price_kg,
        '124_inventory_code': "MAT-BOX-01",
        '125_inbound_material': "토마토 5kg 포장박스",
        '126_lot_number': "LOT-20260301",
        '127_inbound_unit_price': 800,
        '128_produce_in_stock_ton': round(produce_in_stock, 3),
        '129_stock_box': int(stock_box),
        '130_stock_nutrient_L': round(stock_nutrient, 1),
        '131_storage_location_id': "창고-A동",
        '132_outbound_reason': "정상출하" if hour >= 17 else "-",
        '133_adj_qty': 0,
        '134_worker_id': "admin_tae"
    }
    data.append(row)

# DataFrame 변환 및 CSV 저장
df = pd.DataFrame(data)
df.to_csv('mock_farm_managing_1440m.csv', index=False, encoding='utf-8-sig')
print("✅ 1440분(1분 단위) 경영데이터 MOCK 생성이 성공적으로 완료되었습니다.")