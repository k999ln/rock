"""R5 ideal-model calculations; no hardware performance or safety certification."""
from math import pi, hypot, atan2, degrees, tan, radians, sqrt
from pathlib import Path
import json, unittest

ROOT = Path(__file__).resolve().parents[2]
OUT = (Path(__file__).resolve().parent if Path(__file__).name == 'verify_calculations.py'
       else ROOT / 'outputs/avocadoMini_R5_Integrated_Design')

def calculate():
    area = pi*.03*.175 + pi*.096*.025 + pi*(.096**2-.03**2)/4 + pi*.03**2/4
    power = []
    for optical in (0, 5, 15, 30):
        # 22.5 W is a provisional electronic load allocation, not a measurement.
        load = 22.5 + optical
        pin = load/.9
        power.append({'display_assumption_W':optical,'non_display_assumption_W':22.5,
                      'load_W':load,'input_W_at_90pct':round(pin,4),
                      'current_A_at_20V':round(pin/20,4),
                      'ideal_airflow_CFM_at_15K':round(pin/(1.2*1005*15)*2118.880003,4)})
    geometry=[]
    for distance in (0.5,1,2,3):
        top=degrees(atan2(1.8-.18,distance)); feet=degrees(atan2(-.18,distance))
        geometry.append({'horizontal_distance_m':distance,'top_ray_deg':round(top,3),
                         'feet_ray_deg':round(feet,3),'required_vertical_FOV_deg':round(top-feet,3),
                         'aim_tilt_deg':round((top+feet)/2,3),
                         'fits_ideal_60deg_VFOV':top-feet<=60})
    return {
        'revision':'R5','physical_tests':0,'manufacturing_release':False,
        'all_values_are_ideal_models_or_assumptions':True,
        'packaging':{'height_limit_mm':200,'comparison_base_D_mm':96,'comparison_base_H_mm':25,
                     'comparison_tower_D_mm':30,'comparison_tower_H_mm':175,
                     'cm5_bare_board_min_horizontal_circle_mm':round(hypot(55,40),4),
                     'cm5io_bare_board_min_horizontal_circle_mm':round(hypot(160,90),4),
                     'plate_98x160_min_circle_mm':round(hypot(98,160),4),
                     'shape_surface_area_m2':round(area,8),
                     'natural_convection_W_at_h5_delta10':round(area*5*10,4),
                     'natural_convection_W_at_h10_delta10':round(area*10*10,4),
                     'not_a_manufacturing_drawing':True},
        'height_tolerance_example':{'nominal_total_mm':197,'five_segments_tolerance_each_mm':.4,
                                    'worst_case_stack_mm':199,'margin_to_max_mm':1,
                                    'segment_geometry_unselected':True},
        'power_sensitivity':power,
        'camera_height_example_m':.18,'person_height_example_m':1.8,
        'camera_geometry':geometry,
        'stereo_ideal':{'horizontal_pixels':640,'horizontal_FOV_deg':75,'baseline_m':.02,
                         'disparity_error_px':.25,
                         'focal_px':round(640/(2*tan(radians(75)/2)),4),
                         'depth_error_mm_at_1m':round(1**2/(640/(2*tan(radians(75)/2))*.02)*.25*1000,4),
                         'depth_error_mm_at_2m':round(2**2/(640/(2*tan(radians(75)/2))*.02)*.25*1000,4)},
        'network':{'depth_640x480_16bit_30fps_Mbps':640*480*16*30/1e6,
                   'rgb_1280x720_24bit_30fps_Mbps':1280*720*24*30/1e6,
                   'combined_one_node_Mbps':(640*480*16+1280*720*24)*30/1e6,
                   'skeleton_25joints_7float_60Hz_kbps':25*7*4*60*8/1000,
                   'skeleton_four_nodes_Mbps':4*25*7*4*60*8/1e6,
                   'raw_depth_one_hour_GB_decimal':640*480*2*30*3600/1e9},
        'particle':{'count':10000,'naive_pairs_per_frame':10000*9999//2,
                     'naive_pairs_per_second_at60':10000*9999//2*60,
                     'double_buffer_64byte_particle_MB':10000*64*2/1e6,
                     'point_visits_per_second_1000x1x60':1000*1*60,
                     'point_visits_per_second_10000x1x60':10000*1*60,
                     'point_visits_per_second_1000x10x60':1000*10*60},
        'sync':{'time_error_mm_at1mps_1ms':1*.001*1000,
                'time_error_mm_at1mps_5ms':1*.005*1000,
                'rotation_error_mm_at1m_0p1deg':round(tan(radians(.1))*1000,4)},
        'stability_sensitivity':{'mass_assumption_kg':.5,'support_radius_assumption_m':.048,
                                 'force_height_assumption_m':.2,
                                 'tip_force_N_no_dynamic_effects':round(.5*9.81*.048/.2,4)},
        'latency_comparison_ms':{'frame_wait_max_at60':16.7,'preprocess':5,'tracking':8,
                                'simulation_wait':8.3,'network':2,'display_wait':16.7,
                                'simple_sum':56.7,'not_a_measured_percentile':True}
    }

class Checks(unittest.TestCase):
    def setUp(self): self.x=calculate()
    def test_height(self): self.assertEqual(25+175,200)
    def test_tolerance(self): self.assertEqual(197+5*.4,199)
    def test_circle(self): self.assertAlmostEqual(hypot(55,40),68.0073525,places=6)
    def test_big_carrier_does_not_fit(self): self.assertGreater(hypot(160,90),96)
    def test_plate_does_not_fit(self): self.assertGreater(hypot(98,160),96)
    def test_near_body_not_in_60degree_view(self): self.assertFalse(self.x['camera_geometry'][1]['fits_ideal_60deg_VFOV'])
    def test_far_body_in_ideal_view(self): self.assertTrue(self.x['camera_geometry'][2]['fits_ideal_60deg_VFOV'])
    def test_depth_quadratic_error(self): self.assertAlmostEqual(self.x['stereo_ideal']['depth_error_mm_at_2m']/self.x['stereo_ideal']['depth_error_mm_at_1m'],4,places=4)
    def test_network(self): self.assertAlmostEqual(self.x['network']['combined_one_node_Mbps'],811.008)
    def test_particle_pairs(self): self.assertEqual(self.x['particle']['naive_pairs_per_frame'],49995000)
    def test_sync(self): self.assertEqual(self.x['sync']['time_error_mm_at1mps_5ms'],5)
    def test_power_monotonic(self): self.assertEqual(sorted(x['input_W_at_90pct'] for x in self.x['power_sensitivity']),[x['input_W_at_90pct'] for x in self.x['power_sensitivity']])
    def test_no_hardware_pass(self): self.assertEqual(self.x['physical_tests'],0)
    def test_release_hold(self): self.assertFalse(self.x['manufacturing_release'])

if __name__=='__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT/'calculation_results.json').write_text(json.dumps(calculate(),ensure_ascii=False,indent=2)+'\n')
    unittest.main(argv=['calculations'],verbosity=2)
