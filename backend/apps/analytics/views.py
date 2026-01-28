from django.http import JsonResponse

def summary(request):
    return JsonResponse({'ok': True, 'msg': 'analytics coming soon'})
