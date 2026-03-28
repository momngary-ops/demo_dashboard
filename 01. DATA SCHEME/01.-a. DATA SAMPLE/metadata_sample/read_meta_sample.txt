import pandas as pd
import json

# 1. 농장 마스터 데이터 (Farm Level)
farm_meta = [{
    '201_farm_id': 'FARM-TAEAN-001',
    '202_business_reg_number': '123-45-67890',
    '203_farm_name': '그린스케이프 태안팜',
    '204_location_address': '충남 태안군 원북면 발전로',
    '205_manager_contact': '010-1234-5678',
    '206_total_area_ha': 3.0,
    '207_total_area_pyeong': 7300,
    '208_total_zones': 6,
    '209_crop_type': '완숙토마토',
    '210_crop_variety': '데프니스',
    '211_planting_date': '2025-09-06',
    '212_target_harvest_end': '2026-07-23',
    '213_bed_type': '행잉 거터 방식',
    '214_nutrient_controller': '그린CS(마그마플러스)',
    '215_environment_controller': '그린CS(마그마플러스)',
    '216_heating_system': '발전소 폐열 온수 + EHP + 보일러(등유/LPG)',
    '217_cooling_system': 'N',
    '218_co2_system': 'Y (5톤 tank x2)',
    '219_lighting_system': 'N',
    '220_sensor_nodes_count': 24, # 임의 설정 (구역당 4개)
    '221_camera_count': 12        # 임의 설정 (구역당 2개)
}]

# 2. 구역 상세 데이터 (Zone Level) - 6개 구역 분리
zones_meta = [
    {'zone_id': 'Z-2HA-01', 'zone_name': '2ha 1구역', 'area_ha': 0.5, 'sensors': 4, 'cameras': 2, 'remark': '거터 1~74'},
    {'zone_id': 'Z-2HA-02', 'zone_name': '2ha 2구역', 'area_ha': 0.5, 'sensors': 4, 'cameras': 2, 'remark': '거터 75~160'},
    {'zone_id': 'Z-2HA-03', 'zone_name': '2ha 3구역', 'area_ha': 0.5, 'sensors': 4, 'cameras': 2, 'remark': '거터 1~75'},
    {'zone_id': 'Z-2HA-04', 'zone_name': '2ha 4구역', 'area_ha': 0.5, 'sensors': 4, 'cameras': 2, 'remark': '거터 76~150'},
    {'zone_id': 'Z-1HA-01', 'zone_name': '1ha 1구역', 'area_ha': 0.5, 'sensors': 4, 'cameras': 2, 'remark': '기존 1ha 시설'},
    {'zone_id': 'Z-1HA-02', 'zone_name': '1ha 2구역', 'area_ha': 0.5, 'sensors': 4, 'cameras': 2, 'remark': '기존 1ha 시설'}
]

# DataFrame 변환 및 파일 저장
# CSV 형태로 저장
df_farm = pd.DataFrame(farm_meta)
df_farm.to_csv('mock_meta_farm_data.csv', index=False, encoding='utf-8-sig')

df_zones = pd.DataFrame(zones_meta)
df_zones.to_csv('mock_meta_zones_data.csv', index=False, encoding='utf-8-sig')

# 프론트엔드 연동을 위한 JSON 형태로도 출력 (대시보드 프로토타입에 유용)
combined_meta = {
    "farm_info": farm_meta[0],
    "zones_info": zones_meta
}
with open('mock_meta_data.json', 'w', encoding='utf-8') as f:
    json.dump(combined_meta, f, ensure_ascii=False, indent=4)

print("✅ 농장 기본 및 구역 메타데이터(META) MOCK 생성이 완료되었습니다. (CSV 및 JSON 파일 생성)")