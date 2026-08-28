import os
import sys
import json
import subprocess
from glob import glob

def main():
    base_dir = os.path.dirname(__file__)
    results_dir = os.path.join(base_dir, 'results')
    os.makedirs(results_dir, exist_ok=True)
    
    # Clear old results
    for f in glob(os.path.join(results_dir, '*.json')):
        os.remove(f)
        
    print("Running benchmark suite...")
    
    env = os.environ.copy()
    env['DJANGO_SETTINGS_MODULE'] = 'planora_backend.settings'
    env['PYTHONPATH'] = os.path.abspath(os.path.join(base_dir, '..'))
    
    cmd = [sys.executable, "-m", "pytest", base_dir, "-v"]
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    print(result.stdout)
    if result.stderr:
        print("Errors:", result.stderr)
        
    print("\n=== Benchmark Results ===")
    consolidated = {}
    for f in glob(os.path.join(results_dir, '*.json')):
        name = os.path.basename(f)
        if name == 'consolidated_report.json': continue
        with open(f, 'r') as jf:
            consolidated[name] = json.load(jf)
            
    report_path = os.path.join(results_dir, 'consolidated_report.json')
    with open(report_path, 'w') as f:
        json.dump(consolidated, f, indent=2)
        
    print(json.dumps(consolidated, indent=2))
    print(f"\nConsolidated report saved to {report_path}")

if __name__ == '__main__':
    main()
