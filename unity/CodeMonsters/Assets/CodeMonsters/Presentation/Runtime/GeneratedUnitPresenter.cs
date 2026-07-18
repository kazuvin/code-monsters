using UnityEngine;

namespace CodeMonsters.Presentation
{
    public sealed class GeneratedUnitPresenter : MonoBehaviour
    {
        [SerializeField]
        private string unitId = "";

        public string UnitId => unitId;

#if UNITY_EDITOR
        public void SetUnitId(string value)
        {
            unitId = value;
        }
#endif
    }
}
