import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random

# 1. 기초 마스터 데이터 셋업 (300번대 & 400번대 100% 반영)
workers = []
for i in range(1, 31):
    if i <= 2:
        role, nat, skill, lang, visa, emp_type, agency = 'Manager', 'KR', 'Admin', 'KR', '내국인', '정규직', '직고용'
    elif i <= 8:
        role, nat, skill, lang, visa, emp_type, agency = 'Worker', 'KR', 'Expert', 'KR', '내국인', '계절', '직고용'
    else:
        nat = random.choice(['VN', 'TH', 'PH'])
        lang = nat
        role, skill, visa, emp_type, agency = 'Worker', 'Novice', 'E-8', '계절', '글로벌맨파워'
        
    workers.append({
        '301_user_id': f"W-{i:03d}",
        '302_role': role,
        '303_name': f"작업자_{i}",
        '304_profile_img_url': f"https://api.farm.com/img/w{i:03d}.jpg",
        '305_contact': f"010-{random.randint(1000,9999)}-{random.randint(1000,9999)}",
        '306_preferred_language': lang,
        '307_nationality': nat,
        '308_visa_status': visa,
        '309_employment_type': emp_type,
        '310_contract_period': "2026-01-01 ~ 2026-12-31",
        '311_agency_name': agency,
        '312_capable_tasks': "수확, 적엽, 곁순제거" if skill == 'Expert' else "수확, 적엽",
        '313_allowed_zones': "1구역, 2구역, 3구역, 4구역",
        'skill_level': skill # 내부 로직용
    })

tasks = {
    'TSK-01': {'name': '수확', 'diff': '중', 'req_head': 5, 'std_time': 120.0, 'unit': 'kg', 'sop': '빨갛게 익은 과실만 조심해서 수확할 것.', 'img': 'harvest.jpg', 'eval': '상처 없는 과실 비율'},
    'TSK-02': {'name': '적엽', 'diff': '하', 'req_head': 3, 'std_time': 90.0, 'unit': 'bed', 'sop': '맨 아래 누런 잎부터 3장 제거할 것.', 'img': 'deleaf.jpg', 'eval': '줄기 손상 여부'},
    'TSK-03': {'name': '곁순제거', 'diff': '상', 'req_head': 2, 'std_time': 150.0, 'unit': 'row', 'sop': '메인 줄기 이외의 곁순은 모두 제거할 것.', 'img': 'prune.jpg', 'eval': '곁순 잔존율'},
    'TSK-04': {'name': '방제', 'diff': '상', 'req_head': 2, 'std_time': 60.0, 'unit': 'zone', 'sop': '보호구 착용 후 꼼꼼히 살포할 것.', 'img': 'spray.jpg', 'eval': '약제 살포 균일도'}
}

# 2. 작업 지시 및 이행 데이터 생성 (500번대 & 600번대 100% 반영)
start_date = datetime(2026, 2, 16)
days = 30
data = []
order_counter = 1

for d in range(days):
    current_date = start_date + timedelta(days=d)
    
    daily_workers = random.sample([w for w in workers if w['302_role'] == 'Worker'], random.randint(18, 20))
    managers = [w for w in workers if w['302_role'] == 'Manager']
    
    num_orders = random.randint(10, 15)
    
    for _ in range(num_orders):
        task_code = random.choice(list(tasks.keys()))
        t = tasks[task_code]
        
        assignee = random.choice([w for w in daily_workers if w['skill_level'] == 'Expert'] if t['diff'] == '상' else daily_workers)
        manager = random.choice(managers)
        
        order_id = f"ORD-{current_date.strftime('%Y%m%d')}-{order_counter:03d}"
        order_counter += 1
        
        target_amount = round(random.uniform(50, 200), 1)
        start_hour = random.randint(8, 15)
        planned_start = current_date.replace(hour=start_hour, minute=random.randint(0, 59))
        
        # 스킬별 퍼포먼스 차등
        if assignee['skill_level'] == 'Expert':
            time_multiplier, completion_rate, ai_score = random.uniform(0.8, 0.95), random.uniform(0.95, 1.05), round(random.uniform(90, 99), 1)
            issue_type, incomplete_reason = "정상", "-"
        else:
            time_multiplier, completion_rate, ai_score = random.uniform(1.0, 1.3), random.uniform(0.75, 0.95), round(random.uniform(70, 88), 1)
            issue_type = random.choices(["정상", "장비이상", "시간부족"], weights=[7, 1, 2])[0]
            incomplete_reason = "작업 속도 저하로 인한 시간 부족" if issue_type == "시간부족" else "-"
            
        actual_start_time = planned_start + timedelta(minutes=random.randint(0, 15))
        actual_end_time = actual_start_time + timedelta(minutes=(t['std_time'] * time_multiplier))
        completed_amount = round(target_amount * completion_rate, 1)
        
        # AI 비전 및 평가
        status = '완료' if issue_type == "정상" else '이슈발생'
        final_grade = 'A' if ai_score >= 90 else ('B' if ai_score >= 80 else 'C')
        ai_detected = "미수확 과실 잔존" if (final_grade == 'C' and task_code == 'TSK-01') else ("줄기 꺾임" if final_grade == 'C' else "특이사항 없음")
        
        row = {
            # --- 1. 작업자 정보 (301~313) ---
            '301_user_id': assignee['301_user_id'],
            '302_role': assignee['302_role'],
            '303_name': assignee['303_name'],
            '304_profile_img_url': assignee['304_profile_img_url'],
            '305_contact': assignee['305_contact'],
            '306_preferred_language': assignee['306_preferred_language'],
            '307_nationality': assignee['307_nationality'],
            '308_visa_status': assignee['308_visa_status'],
            '309_employment_type': assignee['309_employment_type'],
            '310_contract_period': assignee['310_contract_period'],
            '311_agency_name': assignee['311_agency_name'],
            '312_capable_tasks': assignee['312_capable_tasks'],
            '313_allowed_zones': assignee['313_allowed_zones'],
            
            # --- 2. 작업 마스터 (401~409) ---
            '401_task_code': task_code,
            '402_task_name': t['name'],
            '403_difficulty_level': t['diff'],
            '404_required_headcount': t['req_head'],
            '405_standard_time': t['std_time'],
            '406_unit_type': t['unit'],
            '407_sop_text_kr': t['sop'],
            '408_guide_image_urls': f"https://api.farm.com/guide/{t['img']}",
            '409_eval_criteria': t['eval'],
            
            # --- 3. 작업 지시 및 이행 (501~517) ---
            '501_order_id': order_id,
            '502_task_code_mapped': task_code,
            '503_assigner_id': manager['301_user_id'],
            '504_assignee_id': assignee['301_user_id'],
            '505_target_zone_id': f"Zone-{random.randint(1,4)}",
            '506_priority': random.choices(['긴급', '높음', '보통'], weights=[1, 3, 6])[0],
            '507_target_amount': target_amount,
            '508_planned_datetime': planned_start.strftime('%Y-%m-%d %H:%M:%S'),
            '509_order_memo': "금일 출하량 맞추기 위해 꼼꼼히 진행 요망" if task_code == 'TSK-01' else "",
            '510_status': status,
            '511_read_receipt': True,
            '512_actual_start_time': actual_start_time.strftime('%Y-%m-%d %H:%M:%S'),
            '513_actual_end_time': actual_end_time.strftime('%Y-%m-%d %H:%M:%S'),
            '514_completed_amount': completed_amount,
            '515_issue_type': issue_type,
            '516_incomplete_reason': incomplete_reason,
            '517_worker_feedback': "가위 날이 무뎌 교체 필요함" if issue_type == "장비이상" else "특이사항 없음",
            
            # --- 4. 작업 평가 및 AI 비전 (601~608) ---
            '601_worker_photo_urls': f"https://api.farm.com/upload/{order_id}.jpg",
            '602_robot_vision_id': f"RV-{current_date.strftime('%Y%m%d')}-{random.randint(100,999)}",
            '603_robot_scan_time': (actual_end_time + timedelta(minutes=5)).strftime('%Y-%m-%d %H:%M:%S'),
            '604_ai_eval_score': ai_score,
            '605_ai_detected_issues': ai_detected,
            '606_final_grade': final_grade,
            '607_incentive_points': round(ai_score * 10) if final_grade == 'A' else 0,
            '608_evaluator_memo': "우수함" if final_grade == 'A' else ("조금 더 신경 쓸 것" if final_grade == 'B' else "재교육 필요")
        }
        data.append(row)

# DataFrame 변환 및 CSV 저장
df = pd.DataFrame(data)
df.to_csv('mock_labor_all_data.csv', index=False, encoding='utf-8-sig')
print("✅ 총 43개 전체 항목이 100% 반영된 노동(LABOR) 데이터 MOCK 생성이 성공적으로 완료되었습니다.")