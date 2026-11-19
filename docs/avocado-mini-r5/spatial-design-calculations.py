"""Recalculate design hypotheses; this script performs no hardware tests."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def calculate():
    a = json.loads((ROOT / 'spatial-design-assumptions.json').read_text())
    e, c, l, p, power, stat = (a[k] for k in ['envelope','coverage','latency','position','power','statistics'])
    streams = {s['name']: s['count']*s['width']*s['height']*s['bytesPerPixel']*s['fps']/1e6 for s in a['rawStreams']}
    energy = power['nominalWh']*power['usableFraction']*power['conversionEfficiency']
    grid = math.prod(round(c[k]/c['gridStepM'])+1 for k in ['widthM','depthM','heightM'])
    error = []
    for d in p['distancesM']:
        angular = 1000*d*math.tan(math.radians(p['angleErrorDeg']))
        total = angular+p['calibrationErrorMm']+p['handErrorMm']
        error.append({'distanceM':d,'angularErrorMm':angular,'conservativeSumMm':total,'buttonHalfWidthRemainingMm':p['buttonWidthMm']/2-total})
    return {
      'classification':a['classification'], 'hardwareMeasured':False,
      'outerCylinderLiters':math.pi*(e['outerDiameterMm']/2)**2*e['heightMm']/1e6,
      'idealInnerCylinderLitersBeforeCapsAndMechanism':math.pi*(e['idealInnerDiameterMm']/2)**2*e['heightMm']/1e6,
      'axialSumMm':sum(e['axialZonesMm']), 'gridPoints':grid,
      'gridViewerOrientationConditions':grid*c['viewerPositions']*c['orientations'],
      'idealHorizontalSensorDirections':math.ceil(360/(c['horizontalFovDeg']-c['adjacentOverlapDeg'])),
      'frameIntervalMs':1000/l['refreshHz'], 'latencyBudgetSumMs':sum(l['budgetMs'].values()),
      'positionExamples':error, 'rawStreamDecimalMBps':streams,
      'rawTotalDecimalMBps':sum(streams.values()),
      'memoryTransferExampleDecimalGBps':sum(streams.values())*a['memoryTransferPasses']/1000,
      'availableLoadEnergyWh':energy,
      'remainingStandbyW':(energy-power['satelliteApW']*power['satelliteApHours'])/(power['profileHours']-power['satelliteApHours']),
      'idealActiveDurationHours':{str(w):energy/w for w in power['activeLoadsW']},
      'thermalResistanceExampleKperW':power['allowedRiseExampleK']/power['thermalExampleW'],
      'zeroErrorOneSidedUpperProbability':1-(1-stat['oneSidedConfidence'])**(1/stat['zeroErrorTrials']),
      'excludedFromCalculations':['wire overhead','unmodeled copies','occlusion','optical feasibility','actual thermal and battery derating','hardware and manufacturing acceptance']
    }

if __name__ == '__main__':
    print(json.dumps(calculate(), ensure_ascii=False, indent=2))
