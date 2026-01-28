from rest_framework import permissions


class IsRuleOwnerOrEventOwner(permissions.BasePermission):
    """Allow access only to rule owner or event owner."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if obj.created_by_id == user.id:
            return True
        if obj.event and obj.event.owner_id == user.id:
            return True
        return False
